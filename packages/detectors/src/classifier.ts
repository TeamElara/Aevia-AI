// DeBERTa injection classifier integration (protectai/deberta-v3-base-prompt-injection-v2).
// The backend is pluggable because Alwaz's spike decides it: ONNX in Node, int8 ONNX, or a Python sidecar.
// The model reads 512 tokens; we split by characters with overlap so an attack at the end isn't truncated away.

import { INJECTION_BLOCK, type DetectorContext, type Finding } from './types';

export interface InjectionClassifier {
  name: string;
  /** Probability that each text is an injection, 0..1, same order as the input. */
  scoreBatch(texts: string[]): Promise<number[]>;
}

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
 * In-process ONNX classifier via @huggingface/transformers. NOT a dependency of this package:
 * install it in the gateway only if the spike passes. Untested here until then.
 * The model labels are INJECTION / SAFE; we return P(INJECTION).
 */
export async function createTransformersClassifier(
  model = 'protectai/deberta-v3-base-prompt-injection-v2',
  options: Record<string, unknown> = {},
): Promise<InjectionClassifier> {
  const pkg = '@huggingface/transformers';
  const mod: any = await import(/* @vite-ignore */ pkg);
  const pipe = await mod.pipeline('text-classification', model, options);
  return {
    name: 'deberta',
    async scoreBatch(texts) {
      const out: number[] = [];
      for (const t of texts) {
        const r = await pipe(t, { truncation: true, max_length: 512 });
        const top = Array.isArray(r) ? r[0] : r;
        out.push(top.label === 'INJECTION' ? top.score : 1 - top.score);
      }
      return out;
    },
  };
}
