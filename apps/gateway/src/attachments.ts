import { randomInt, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Finding, User } from '../../../types.js';
import type { Audit } from './audit.js';
import { GatewayError } from './errors.js';
import type { Scanner } from './scanner.js';

// Photos and PDFs in chat. The file never leaves the gateway: its text is read here (PDF text,
// or offline OCR for photos and scanned pages), cleaned so the request does not have to stop,
// and then sent through the normal pipeline like a typed message. The person gets the answer,
// the cleaned text and, for anything read by OCR, the page with black bars over what was hidden.

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const MAX_OCR_PAGES = 5;
/** Text past this is left out of the request; the response says so. */
export const MAX_TEXT = 20_000;
const MAX_IMAGE_SIDE = 2400;
const OCR_TIMEOUT_MS = 45_000;

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp';
type Box = { x0: number; y0: number; x1: number; y1: number };
type Word = { start: number; end: number; bbox: Box };
type Page = { number: number; text: string; ocr: boolean; png?: Buffer; width?: number; height?: number; words?: Word[] };

/** File type from its first bytes; the name and declared type are never trusted. */
export function sniff(data: Buffer): FileKind | null {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
/** One offline Tesseract worker (English and Hindi), shared and used one page at a time. */
class Ocr {
  private worker?: Promise<OcrWorker>;
  private queue: Promise<unknown> = Promise.resolve();
  private start() {
    if (!this.worker) {
      this.worker = (async () => {
        const { createWorker, OEM } = await import('tesseract.js');
        // Each language ships in its own package, but Tesseract reads every language from one
        // folder, so both files are copied into a private temporary folder once. No network.
        const require = createRequire(import.meta.url);
        const folder = await mkdtemp(join(tmpdir(), 'leakshield-ocr-'));
        for (const lang of ['eng', 'hin']) {
          const file = `${lang}.traineddata.gz`;
          await copyFile(join(dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`)), '4.0.0_best_int', file), join(folder, file));
        }
        return createWorker(['eng', 'hin'], OEM.LSTM_ONLY, { langPath: folder, cachePath: folder, cacheMethod: 'none', gzip: true });
      })();
      this.worker.catch(() => { this.worker = undefined; });
    }
    return this.worker;
  }
  read(png: Buffer): Promise<{ text: string; words: Word[] }> {
    const job = this.queue.then(async () => {
      const worker = await this.start();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          worker.recognize(png, {}, { blocks: true }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new GatewayError('OCR_TIMEOUT', 504)), OCR_TIMEOUT_MS); }),
        ]);
        // Rebuild the text from words so every character offset maps back to a box on the page.
        let text = ''; const words: Word[] = [];
        for (const block of result.data.blocks ?? []) for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            const parts = line.words.filter(w => w.text.trim());
            parts.forEach((w, i) => {
              if (i) text += ' ';
              words.push({ start: text.length, end: text.length + w.text.length, bbox: w.bbox });
              text += w.text;
            });
            if (parts.length) text += '\n';
          }
          text += '\n';
        }
        return { text: text.trim() ? text : '', words };
      } catch (error) {
        // A stuck worker is replaced rather than left to block every later upload.
        if (error instanceof GatewayError) { const stale = this.worker; this.worker = undefined; void stale?.then(w => w.terminate()).catch(() => undefined); }
        throw error;
      } finally { clearTimeout(timer); }
    });
    this.queue = job.catch(() => undefined);
    return job;
  }
  async close() { const worker = this.worker; this.worker = undefined; await (await worker?.catch(() => undefined))?.terminate(); }
}

async function canvas() { return import('@napi-rs/canvas'); }

/** Decode any supported photo into a PNG no larger than MAX_IMAGE_SIDE on either side. */
async function normalisePhoto(data: Buffer) {
  const { createCanvas, loadImage } = await canvas();
  const image = await loadImage(data).catch(() => { throw new GatewayError('UNREADABLE_FILE', 422); });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale)); const height = Math.max(1, Math.round(image.height * scale));
  const surface = createCanvas(width, height); const ctx = surface.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return { png: surface.toBuffer('image/png'), width, height };
}

/** Text pages straight from the PDF; pages with almost no text are treated as scans and read by OCR. */
async function readPdf(data: Buffer, ocr: Ocr): Promise<Page[]> {
  const { getDocumentProxy, extractText, renderPageAsImage } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data)).catch(() => { throw new GatewayError('UNREADABLE_FILE', 422); });
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new GatewayError('TOO_MANY_PAGES', 413);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages: Page[] = []; let scanned = 0;
    for (const [index, pageText] of (text as string[]).entries()) {
      const number = index + 1;
      if (pageText.replace(/\s+/g, '').length >= 20) { pages.push({ number, text: pageText, ocr: false }); continue; }
      if (++scanned > MAX_OCR_PAGES) throw new GatewayError('TOO_MANY_SCANNED_PAGES', 413);
      const rendered = await renderPageAsImage(pdf, number, { canvasImport: canvas, scale: 2 });
      const photo = await normalisePhoto(Buffer.from(rendered));
      pages.push({ number, ocr: true, ...photo, ...await ocr.read(photo.png) });
    }
    return pages;
  } finally { await pdf.cleanup().catch(() => undefined); }
}

const SECRETS = new Set(['SECRET', 'CREDENTIAL', 'PRIVATE_KEY']);
/** What a person would call sensitive in a document; injection is handled separately. */
const HIDDEN = new Set(['AADHAAR', 'VID', 'PAN', 'CARD', 'BANK_ACCOUNT', 'IFSC', 'UPI', 'PHONE', 'EMAIL', 'CONFIDENTIAL', ...SECRETS]);
const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const secretTag = () => `[SECRET_${Array.from({ length: 4 }, () => B32[randomInt(B32.length)]).join('')}]`;

type Span = { start: number; end: number; category: string };
function merge(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const span of sorted) {
    const last = out.at(-1);
    if (last && span.start < last.end) { last.end = Math.max(last.end, span.end); continue; }
    out.push({ ...span });
  }
  return out;
}
/** Widen an injection hit to its whole line, so no half-instruction survives. */
function lineOf(text: string, span: Span): Span {
  const start = text.lastIndexOf('\n', span.start - 1) + 1;
  const next = text.indexOf('\n', span.end);
  return { start, end: next === -1 ? text.length : next, category: 'INJECTION' };
}
function replace(text: string, spans: Span[], label: (span: Span) => string) {
  let out = ''; let at = 0;
  for (const span of spans) { out += text.slice(at, span.start) + label(span); at = span.end; }
  return out + text.slice(at);
}

export interface AttachmentSummary {
  name: string; kind: FileKind; pages: number; ocr_pages: number; truncated: boolean;
  /** Secrets, instructions and codenames taken out before the request, so it need not stop. */
  removed: Record<string, number>;
  /** Everything sensitive found in the file, by category; personal data is masked by the pipeline. */
  found: Record<string, number>;
  /** The file's text with every sensitive value shown as its category. */
  masked_text: string;
  /** Pages read by OCR, as PNG data URLs with black bars over what was hidden. */
  redacted_pages: { page: number; image: string }[];
}

export class Attachments {
  private readonly ocr = new Ocr();
  private running = 0;
  constructor(private readonly scanner: Scanner, private readonly audit?: Audit, private readonly splitSecrets?: (messages: string[]) => Finding[]) {}

  /**
   * Read the file and clean it. Returns the text to send (secrets as placeholders, instruction lines
   * removed, codenames hidden) and what to show the person. Personal data is left for the pipeline,
   * which masks it reversibly so the answer can be restored for the person who asked.
   */
  async prepare(user: User, name: string, data: Buffer): Promise<{ text: string; summary: AttachmentSummary }> {
    if (!data.length) throw new GatewayError('EMPTY_FILE', 400);
    if (data.length > MAX_FILE_BYTES) throw new GatewayError('FILE_TOO_LARGE', 413);
    const kind = sniff(data);
    if (!kind) throw new GatewayError('UNSUPPORTED_FILE', 415);
    if (this.running >= 2) throw new GatewayError('ATTACHMENT_BUSY', 429);
    this.running++;
    try {
      const pages = kind === 'pdf' ? await readPdf(data, this.ocr) : await (async () => {
        const photo = await normalisePhoto(data);
        return [{ number: 1, ocr: true, ...photo, ...await this.ocr.read(photo.png) }];
      })();

      // One text for the whole file, remembering where each page starts so OCR boxes can be found again.
      let full = ''; const offsets: number[] = [];
      for (const page of pages) {
        if (pages.length > 1) full += `--- Page ${page.number} ---\n`;
        offsets.push(full.length);
        full += page.text.trim() ? page.text : '';
        full += '\n\n';
      }
      const truncated = full.length > MAX_TEXT;
      const text = full.slice(0, MAX_TEXT);
      if (!text.replace(/--- Page \d+ ---|\s/g, '')) throw new GatewayError('NO_TEXT_FOUND', 422);

      const findings = [
        ...await this.scanner.scan(text, { source: 'prompt', user, requestId: randomUUID(), canaries: [] }),
        ...(this.splitSecrets ? this.splitSecrets([text]).filter(f => f.end <= text.length) : []),
      ];
      const hidden = merge(findings.filter(f => HIDDEN.has(f.category)).map(({ start, end, category }) => ({ start, end, category })));
      const injected = merge(findings.filter(f => f.category === 'INJECTION' && f.score >= 0.6).map(f => lineOf(text, { ...f })));
      const removedSpans = merge([...injected, ...hidden.filter(s => SECRETS.has(s.category) || s.category === 'CONFIDENTIAL')]);

      const label = (category: string) => SECRETS.has(category) ? 'SECRET' : category;
      const count = (spans: Span[]) => spans.reduce<Record<string, number>>((n, s) => ({ ...n, [label(s.category)]: (n[label(s.category)] ?? 0) + 1 }), {});
      const removed = count(removedSpans);
      const found = count([...hidden, ...injected]);

      const cleaned = replace(text, removedSpans, s => s.category === 'INJECTION' ? '[instruction removed]' : s.category === 'CONFIDENTIAL' ? '[CONFIDENTIAL]' : secretTag());
      const masked_text = replace(text, merge([...hidden, ...injected]), s => s.category === 'INJECTION' ? '[instruction removed]' : `[${label(s.category)}]`);

      const redacted_pages: AttachmentSummary['redacted_pages'] = [];
      const covered = merge([...hidden, ...injected]);
      for (const [index, page] of pages.entries()) {
        if (!page.ocr || !page.png || !page.words) continue;
        const base = offsets[index]!;
        const boxes = page.words.filter(w => covered.some(s => base + w.start < s.end && base + w.end > s.start)).map(w => w.bbox);
        redacted_pages.push({ page: page.number, image: await blackOut(page.png, boxes) });
      }

      const summary: AttachmentSummary = { name, kind, pages: pages.length, ocr_pages: pages.filter(p => p.ocr).length, truncated, removed, found, masked_text, redacted_pages };
      await this.record(user, summary);
      return { text: cleaned, summary };
    } finally { this.running--; }
  }

  async close() { await this.ocr.close(); }

  // Metadata only: categories and counts of what was taken out of the file before the request.
  private async record(user: User, summary: AttachmentSummary) {
    if (!this.audit) return;
    const categories = Object.keys(summary.found);
    await this.audit.write({
      request_id: randomUUID(), ts: new Date(), user_pseudo: this.audit.pseudo(user), conversation_pseudo: this.audit.fingerprint('conversation', `attachment:${randomUUID()}`),
      stage: 'attachment', categories, counts: { ...summary.found, pages: summary.pages, ocr_pages: summary.ocr_pages },
      rule_ids: [`attachment.${summary.kind}`, ...(Object.keys(summary.removed).length ? ['attachment.cleaned'] : [])], policy_version: 'attachment',
      action: Object.keys(summary.removed).length ? 'mask' : categories.length ? 'warn' : 'allow', model_called: false, via: [], stage_ms: {}, total_ms: 0,
    });
  }
}

async function blackOut(png: Buffer, boxes: Box[]): Promise<string> {
  const { createCanvas, loadImage } = await canvas();
  const image = await loadImage(png);
  const surface = createCanvas(image.width, image.height); const ctx = surface.getContext('2d');
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = '#000';
  for (const b of boxes) ctx.fillRect(b.x0 - 3, b.y0 - 3, b.x1 - b.x0 + 6, b.y1 - b.y0 + 6);
  return `data:image/png;base64,${surface.toBuffer('image/png').toString('base64')}`;
}
