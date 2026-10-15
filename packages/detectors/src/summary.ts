// Shapes findings for the chat API and the audit event without carrying offsets, scores or values.
// API: docs/API.md (`findings`, `rule_ids`). Audit allowlist: PLAN.md section 8.

import type { Category, Finding, Source, Via } from './types';

/** What `POST /api/chat` returns per finding. No offsets: they would let a reader locate the value. */
export interface FindingSummary {
  category: Category;
  source: Source;
  via: Via;
  ruleId: string;
}

export interface FindingDigest {
  findings: FindingSummary[];
  /** Unique rule ids, in first-seen order. */
  rule_ids: string[];
  /** Unique categories, in first-seen order. */
  categories: Category[];
  /** Findings per category. */
  counts: Partial<Record<Category, number>>;
  /** Unique `via` values, so the dashboard can show which evasions were caught. */
  via: Via[];
}

/** Copy only the allowlisted fields, so a new field on Finding can never leak by accident. */
export function toFindingSummary(f: Finding): FindingSummary {
  return { category: f.category, source: f.source, via: f.via, ruleId: f.ruleId };
}

export function summariseFindings(findings: Finding[]): FindingDigest {
  const seen = new Set<string>();
  const summaries: FindingSummary[] = [];
  const ruleIds: string[] = [];
  const categories: Category[] = [];
  const counts: Partial<Record<Category, number>> = {};
  const via: Via[] = [];
  for (const f of findings) {
    const s = toFindingSummary(f);
    const key = `${s.category}|${s.source}|${s.via}|${s.ruleId}`;
    if (!seen.has(key)) {
      seen.add(key);
      summaries.push(s);
    }
    if (!ruleIds.includes(f.ruleId)) ruleIds.push(f.ruleId);
    if (!categories.includes(f.category)) categories.push(f.category);
    if (!via.includes(f.via)) via.push(f.via);
    counts[f.category] = (counts[f.category] ?? 0) + 1;
  }
  return { findings: summaries, rule_ids: ruleIds, categories, counts, via };
}
