// Detection metrics for threshold tuning on the DEV set only.
// This measures the detectors, not the gateway's final action (that's the eval runner's job).

import { detectAll, detectResponse, detectSplitSecrets, injectionScore } from '../src';
import type { Category, Finding } from '../src/types';

// Format: eval/README.md. attached_doc is a corpus id; pass the corpus texts (seed/corpus.js) to scan it as a document.
export interface EvalCase {
  id: string;
  split?: string;
  category?: string;
  user?: string;
  history?: string[];
  prompt: string;
  attached_doc?: string | null;
  expected_action: string;
  expected_categories?: string[];
  /** Dev only: a synthetic model answer, scanned as the response. */
  response?: string;
}

// Categories this package can produce; others in expected_categories (e.g. ACL) belong to other stages.
const DETECTOR_CATEGORIES = new Set<string>([
  'AADHAAR', 'VID', 'PAN', 'PHONE', 'CARD', 'IFSC', 'UPI', 'BANK_ACCOUNT', 'EMAIL',
  'SECRET', 'PRIVATE_KEY', 'CONFIDENTIAL', 'CANARY', 'INJECTION',
]);

export interface CaseResult {
  id: string;
  expectedInjection: boolean;
  injection: number;
  expectedData: string[];
  foundData: string[];
  /** Data categories found at mask-level score in a case expected to be allowed. */
  falseData: string[];
  /** The case attaches a document whose text wasn't supplied, so its expectations can't be measured here. */
  docMissing: boolean;
}

const DATA_FLAG_SCORE = 0.6;

const USERS = ['asha', 'ravi', 'meera', 'ceo', 'admin'];

export function runCase(c: EvalCase, docs: Record<string, string> = {}): CaseResult {
  const ctx = { knownUsers: USERS, currentUser: c.user };
  const history = c.history ?? [];
  const docText = c.attached_doc ? docs[c.attached_doc] : undefined;
  const findings: Finding[] = [
    ...detectAll(c.prompt, { ...ctx, source: 'prompt' }),
    ...history.flatMap((h) => detectAll(h, { ...ctx, source: 'history' })),
    ...detectSplitSecrets([...history, c.prompt]),
    ...(docText ? detectAll(docText, { ...ctx, source: 'document' }) : []),
    ...(c.response ? detectResponse(c.response, ctx) : []),
  ];
  const expected = (c.expected_categories ?? []).filter((e) => DETECTOR_CATEGORIES.has(e));
  const data = findings.filter((f) => f.category !== 'INJECTION');
  // Any finding counts as "detected" (a checksum-only Aadhaar at 0.5 is a correct warn);
  // only mask-level findings count as false positives in allowed cases.
  const foundData = [...new Set(data.map((f) => f.category))];
  const maskLevel = [...new Set(data.filter((f) => f.score >= DATA_FLAG_SCORE).map((f) => f.category))];
  return {
    id: c.id,
    expectedInjection: expected.includes('INJECTION'),
    injection: injectionScore(findings),
    expectedData: expected.filter((e) => e !== 'INJECTION'),
    foundData,
    falseData: c.expected_action === 'allow' ? maskLevel : [],
    docMissing: Boolean(c.attached_doc) && docText === undefined,
  };
}

export interface ThresholdRow {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
}

export function sweep(results: CaseResult[], thresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95]): ThresholdRow[] {
  return thresholds.map((t) => {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const r of results) {
      if (r.docMissing) continue;
      const hit = r.injection >= t;
      if (r.expectedInjection && hit) tp++;
      else if (r.expectedInjection) fn++;
      else if (hit) fp++;
      else tn++;
    }
    return { threshold: t, tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : 1, recall: tp + fn ? tp / (tp + fn) : 1 };
  });
}

export function categoryRecall(results: CaseResult[]): Record<string, { expected: number; found: number }> {
  const out: Record<string, { expected: number; found: number }> = {};
  for (const r of results) {
    if (r.docMissing) continue;
    for (const c of r.expectedData) {
      out[c] ??= { expected: 0, found: 0 };
      out[c].expected++;
      if (r.foundData.includes(c as Category)) out[c].found++;
    }
  }
  return out;
}

const FORBIDDEN = /heldout|held-out|held_out|robustness|live_subset|live-subset/i;

/** Team rule: detection tuning never looks at held-out, robustness or live-subset files. */
export function assertDevFile(path: string, cases: EvalCase[]): void {
  if (FORBIDDEN.test(path)) throw new Error(`refusing to tune on ${path}: dev set only until the hour-15 freeze`);
  const bad = cases.find((c) => c.split && c.split !== 'dev');
  if (bad) throw new Error(`case ${bad.id} has split "${bad.split}"; tuning uses dev cases only`);
}

export function parseJsonl(text: string): EvalCase[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .map((l, i) => {
      try {
        return JSON.parse(l) as EvalCase;
      } catch {
        throw new Error(`line ${i + 1}: not valid JSON`);
      }
    });
}
