import type { Detector, Hit } from './types';

const LABELS = /\b(?:STRICTLY\s+CONFIDENTIAL|CONFIDENTIAL|RESTRICTED|INTERNAL\s+ONLY|TOP\s+SECRET|NOT\s+FOR\s+DISTRIBUTION)\b/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Canary markers from the system prompt or restricted docs. Matched case-insensitively with
 * separators stripped, so "l s - c a n a r y - 7 f 3 a 9 1" still counts.
 */
export const canary: Detector = (text, ctx) => {
  const hits: Hit[] = [];
  const canaries = (ctx.canaries ?? []).filter((c) => c.trim().length >= 6);
  if (canaries.length === 0) return hits;
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (/[\p{L}\p{N}]/u.test(text[i])) {
      chars.push(text[i].toLowerCase());
      map.push(i);
    }
  }
  const stripped = chars.join('');
  for (const c of canaries) {
    const needle = c.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    let from = 0;
    for (;;) {
      const at = stripped.indexOf(needle, from);
      if (at < 0) break;
      hits.push({ category: 'CANARY', start: map[at], end: map[at + needle.length - 1] + 1, score: 1, ruleId: 'confidential.canary' });
      from = at + 1;
    }
  }
  return hits;
};

export const confidential: Detector = (text, ctx) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(LABELS)) {
    hits.push({ category: 'CONFIDENTIAL', start: m.index!, end: m.index! + m[0].length, score: 0.7, ruleId: 'confidential.label' });
  }
  for (const phrase of ctx.protectedPhrases ?? []) {
    if (!phrase.trim()) continue;
    const re = new RegExp(`\\b${escapeRe(phrase.trim()).replace(/\s+/g, '\\s+')}\\b`, 'gi');
    for (const m of text.matchAll(re)) {
      hits.push({ category: 'CONFIDENTIAL', start: m.index!, end: m.index! + m[0].length, score: 0.8, ruleId: 'confidential.protected_phrase' });
    }
  }
  return hits;
};
