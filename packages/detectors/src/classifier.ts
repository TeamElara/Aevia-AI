// DeBERTa injection classifier integration (protectai/deberta-v3-base-prompt-injection-v2).
// The backend is pluggable because Alwaz's spike decides it: ONNX in Node, int8 ONNX, or a Python sidecar.
// The model reads 512 tokens; we split by characters with overlap so an attack at the end isn't truncated away.

import { detectAll } from './detect';
import { injectionScore } from './injection';
import { INJECTION_BLOCK, type DetectorContext, type Finding } from './types';

export interface InjectionClassifier {
  name: string;
  /** Probability that each text is an injection, 0..1, same order as the input. */
  scoreBatch(texts: string[]): Promise<number[]>;
  close?(): Promise<void> | void;
}

// Pinned in Alwaz's spike (docs/CLASSIFIER-DECISION.md on codex/alwaz-access-approvals).
export const CLASSIFIER_MODEL = 'protectai/deberta-v3-base-prompt-injection-v2';
export const CLASSIFIER_REVISION = '90c9989b1a342275dd0d1a95aad283c04e075671';
export const MAX_MODEL_TOKENS = 512;

export interface Window {
  start: number;
  end: number;
  text: string;
}

// ~512 DeBERTa tokens is ~2000 chars of English; Hinglish and code tokenise worse, so stay under.
export const WINDOW_CHARS = 1500;
export const WINDOW_OVERLAP = 250;

export function splitWindows(text: string, size = WINDOW_CHARS, overlap = WINDOW_OVERLAP): Window[] {
  if (text.length <= size) return [{ start: 0, end: text.length, text }];
  const out: Window[] = [];
  let start = 0;
  for (;;) {
    let end = Math.min(text.length, start + size);
    // Prefer to cut at whitespace so words aren't split, as long as the window stays well over the overlap.
    if (end < text.length) {
      const ws = text.lastIndexOf(' ', end - 1);
      if (ws > start + overlap * 2) end = ws;
    }
    out.push({ start, end, text: text.slice(start, end) });
    if (end >= text.length) return out;
    // Next window starts `overlap` chars before this one ended, at a word start when possible.
    let next = end - overlap;
    const ws = text.indexOf(' ', next);
    if (ws >= 0 && ws < end) next = ws + 1;
    start = Math.max(start + 1, next);
  }
}

/** The classifier is skipped when the rules already block: it can only raise the score. */
export function shouldRunClassifier(ruleScore: number): boolean {
  return ruleScore < INJECTION_BLOCK;
}

export function combineInjection(ruleScore: number, classifierScore: number | null): number {
  return Math.max(ruleScore, classifierScore ?? 0);
}

export type ClassifierResult =
  | { ok: true; score: number; finding: Finding | null; windows: number; ms: number }
  | { ok: false; error: 'timeout' | 'classifier_error'; ms: number };

/**
 * Score `text` in windows and return the highest window as an INJECTION finding (ruleId inj.classifier).
 * Fails closed: on timeout or error the result is ok:false and the gateway should treat it as a scan failure.
 */
export async function classifyInjection(
  text: string,
  ctx: DetectorContext,
  classifier: InjectionClassifier,
  opts: { timeoutMs?: number; minScore?: number } = {},
): Promise<ClassifierResult> {
  const t0 = performance.now();
  const timeoutMs = opts.timeoutMs ?? 2000;
  const minScore = opts.minScore ?? 0.3;
  const windows = splitWindows(text);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const scores = await Promise.race([
      classifier.scoreBatch(windows.map((w) => w.text)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      }),
    ]);
    if (!Array.isArray(scores) || scores.length !== windows.length || scores.some((s) => typeof s !== 'number' || Number.isNaN(s))) {
      return { ok: false, error: 'classifier_error', ms: performance.now() - t0 };
    }
    let best = 0;
    for (let k = 1; k < scores.length; k++) if (scores[k] > scores[best]) best = k;
    const score = Math.min(1, Math.max(0, scores[best]));
    const w = windows[best];
    const finding: Finding | null =
      score >= minScore
        ? { category: 'INJECTION', source: ctx.source, start: w.start, end: w.end, score: Number(score.toFixed(2)), ruleId: `inj.classifier.${classifier.name}`, via: 'raw' }
        : null;
    return { ok: true, score, finding, windows: windows.length, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message === 'timeout' ? 'timeout' : 'classifier_error', ms: performance.now() - t0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Client for a classifier sidecar: POST { texts: string[] } -> { scores: number[] }.
 * Keep the sidecar on localhost: raw prompt text is sent to it.
 */
export function createHttpClassifier(url: string, name = 'sidecar'): InjectionClassifier {
  return {
    name,
    async scoreBatch(texts) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts }),
      });
      if (!res.ok) throw new Error(`classifier sidecar HTTP ${res.status}`);
      const body = (await res.json()) as { scores?: number[] };
      if (!Array.isArray(body.scores)) throw new Error('classifier sidecar: missing scores');
      return body.scores;
    },
  };
}

/**
 * Score `text` with a model that accepts at most `limit` tokens, without truncating.
 * A window that tokenises too long (dense Hinglish, code, hex) is split in two with a small overlap
 * and the higher score wins, so nothing at the end is silently dropped.
 */
export async function scoreWithTokenLimit(
  text: string,
  countTokens: (t: string) => Promise<number>,
  score: (t: string) => Promise<number>,
  limit = MAX_MODEL_TOKENS,
  depth = 0,
): Promise<number> {
  if ((await countTokens(text)) <= limit) return score(text);
  if (depth >= 8 || text.length < 32) throw new Error('window cannot be reduced under the token limit');
  const mid = text.length >> 1;
  const ws = text.lastIndexOf(' ', mid);
  const cut = ws > text.length / 4 ? ws : mid;
  const overlap = Math.min(100, cut >> 2);
  const left = text.slice(0, cut);
  const right = text.slice(Math.max(0, cut - overlap));
  const a = await scoreWithTokenLimit(left, countTokens, score, limit, depth + 1);
  const b = await scoreWithTokenLimit(right, countTokens, score, limit, depth + 1);
  return Math.max(a, b);
}

export interface TransformersClassifierOptions {
  /** 'fp32' loads the pinned upstream model; 'q8' needs a locally quantised model (see Alwaz's spike). */
  dtype?: 'fp32' | 'q8' | string;
  cacheDir?: string;
  /** Path or id of a local model, e.g. the int8 export. Skips the pinned revision. */
  localModel?: string;
  revision?: string;
}

/**
 * In-process ONNX classifier via @huggingface/transformers, configured as in the spike:
 * pinned revision, CPU, labels read with top_k: 2, P(INJECTION) returned.
 * `@huggingface/transformers` is an optional peer dependency; first load downloads ~713 MB (fp32).
 */
export async function createTransformersClassifier(opts: TransformersClassifierOptions = {}): Promise<InjectionClassifier> {
  const pkg = '@huggingface/transformers';
  const mod: any = await import(/* @vite-ignore */ pkg);
  if (opts.cacheDir) mod.env.cacheDir = opts.cacheDir;
  const model = opts.localModel ?? CLASSIFIER_MODEL;
  const pipe = await mod.pipeline('text-classification', model, {
    revision: opts.localModel ? undefined : (opts.revision ?? CLASSIFIER_REVISION),
    dtype: opts.dtype ?? 'fp32',
    device: 'cpu',
  });
  const countTokens = async (t: string): Promise<number> => (await pipe.tokenizer(t)).input_ids.dims.at(-1);
  const score = async (t: string): Promise<number> => {
    const rows = await pipe(t, { top_k: 2 });
    const injection = (rows as Array<{ label: string; score: number }>).find((r) => r.label === 'INJECTION');
    if (!injection || !Number.isFinite(injection.score)) throw new Error('unknown classifier label contract');
    return injection.score;
  };
  return {
    name: 'deberta',
    async scoreBatch(texts) {
      const out: number[] = [];
      for (const t of texts) out.push(await scoreWithTokenLimit(t, countTokens, score));
      return out;
    },
    close: () => pipe.dispose?.(),
  };
}

/**
 * Rules first, then the classifier for user text (prompt and history) when the rules haven't already blocked.
 * Documents are scored once at ingest and model responses aren't classified. Throws if the classifier
 * times out or errors, so the gateway's scanner fails the request closed.
 */
export async function detectWithClassifier(
  text: string,
  ctx: DetectorContext,
  classifier: InjectionClassifier | null,
  opts: { timeoutMs?: number } = {},
): Promise<Finding[]> {
  const findings = detectAll(text, ctx);
  if (!classifier || (ctx.source !== 'prompt' && ctx.source !== 'history') || !text.trim()) return findings;
  if (!shouldRunClassifier(injectionScore(findings))) return findings;
  const r = await classifyInjection(text, ctx, classifier, opts);
  if (r.ok === false) throw new Error(`classifier ${r.error}`);
  return r.finding ? [...findings, r.finding] : findings;
}
