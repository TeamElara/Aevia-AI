import { canary, confidential } from './confidential';
import { detectInjection } from './injection';
import { decodeBlocks, normalise, toOriginal } from './normalise';
import { PII_DETECTORS } from './pii';
import { secrets } from './secrets';
import { keepNonOverlapping } from './spans';
import type { Category, Detector, DetectorContext, Finding, Hit, Via } from './types';

export * from './types';
export { verhoeffValid, verhoeffCheckDigit, luhnValid, cardIssuer } from './checksums';
export { normalise, leetFold, decodeBlocks } from './normalise';
export { detectInjection, injectionScore } from './injection';
export { detectSplitSecrets, type SplitSecretFinding } from './secrets';
export { findLinks, type Link } from './links';
export {
  classifyInjection,
  combineInjection,
  createHttpClassifier,
  createTransformersClassifier,
  shouldRunClassifier,
  splitWindows,
  type ClassifierResult,
  type InjectionClassifier,
} from './classifier';
export { seededValues, findSeededLeaks, type SeededValue } from './privacy';

const DATA_DETECTORS: Detector[] = [secrets, canary, confidential, ...PII_DETECTORS];

// When data findings overlap, the more specific / more dangerous category wins.
const PRIORITY: Category[] = [
  'PRIVATE_KEY', 'SECRET', 'CANARY', 'AADHAAR', 'VID', 'CARD', 'PAN', 'BANK_ACCOUNT', 'PHONE', 'UPI', 'EMAIL', 'IFSC', 'CONFIDENTIAL',
];

function runData(text: string, ctx: DetectorContext): Hit[] {
  return DATA_DETECTORS.flatMap((d) => d(text, ctx));
}

function withMeta(h: Hit, ctx: DetectorContext, via: Via): Finding {
  return { ...h, source: ctx.source, via };
}

function dedupeData(fs: Finding[]): Finding[] {
  const viaRank: Record<Via, number> = { raw: 0, normalised: 1, decoded: 2 };
  const sorted = [...fs].sort(
    (a, b) =>
      PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category) ||
      b.score - a.score ||
      viaRank[a.via] - viaRank[b.via] ||
      b.end - b.start - (a.end - a.start),
  );
  return keepNonOverlapping(sorted);
}

/** Larger inputs are refused rather than scanned; the gateway should block them. */
export const MAX_SCAN_CHARS = 100_000;

export class ScanLimitError extends Error {
  constructor(length: number) {
    super(`input of ${length} chars exceeds MAX_SCAN_CHARS (${MAX_SCAN_CHARS})`);
    this.name = 'ScanLimitError';
  }
}

/**
 * Run every detector over the original text, the normalised text and any decoded blocks.
 * Offsets in the result always point into `text`. Findings never contain the matched value.
 * Throws ScanLimitError for oversized input.
 */
export function detectAll(text: string, ctx: DetectorContext): Finding[] {
  if (text.length > MAX_SCAN_CHARS) throw new ScanLimitError(text.length);
  const data: Finding[] = runData(text, ctx).map((h) => withMeta(h, ctx, 'raw'));

  const norm = normalise(text);
  if (norm.text !== text) {
    for (const h of runData(norm.text, ctx)) {
      const o = toOriginal(norm.map, h.start, h.end, text);
      data.push(withMeta({ ...h, start: o.start, end: o.end }, ctx, 'normalised'));
    }
  }

  const injection = detectInjection(text, ctx);

  for (const block of decodeBlocks(text)) {
    for (const h of runData(block.decoded, ctx)) {
      data.push(withMeta({ ...h, start: block.start, end: block.end }, ctx, 'decoded'));
    }
    for (const f of detectInjection(block.decoded, ctx)) {
      injection.push({ ...f, start: block.start, end: block.end, via: 'decoded' });
    }
  }

  return [...dedupeData(data), ...injection].sort((a, b) => a.start - b.start || b.score - a.score);
}

export type ScanResult =
  | { ok: true; findings: Finding[]; ms: number }
  | { ok: false; error: 'too_large' | 'scanner_error'; ms: number };

/**
 * Fail-closed wrapper for the gateway: never throws, and an `ok: false` result means "block".
 * The error never carries the input text or the exception message, so it is safe to log.
 */
export function safeDetectAll(text: string, ctx: DetectorContext): ScanResult {
  const t0 = performance.now();
  try {
    const findings = detectAll(text, ctx);
    return { ok: true, findings, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof ScanLimitError ? 'too_large' : 'scanner_error', ms: performance.now() - t0 };
  }
}

/** Response-side scan: same detectors; pass the canaries so a leaked marker is caught. */
export function detectResponse(text: string, ctx: Omit<DetectorContext, 'source'>): Finding[] {
  return detectAll(text, { ...ctx, source: 'response' });
}
