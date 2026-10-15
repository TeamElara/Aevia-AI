// Rule layer of the injection engine: intent x target, Hinglish, structural tells, cross-user.
// The DeBERTa classifier (if the spike passes) is combined by the gateway as max(rules, classifier).

import { leetFold, normalise, toOriginal } from './normalise';
import type { DetectorContext, Finding, Via } from './types';

interface Span {
  start: number;
  end: number;
}

// Override intents: ignore / forget the rules.
const OVERRIDE_INTENT = /\b(?:ignore|disregard|forget|override|overrule|bypass|discard|drop|skip|abandon)\b/gi;
const OVERRIDE_TARGET =
  /\b(?:(?:all|any|every|the|these|those|your|my|previous|prior|above|earlier|preceding|initial|original|system|developer|safety)\s+){0,3}(?:instructions?|rules|guidelines|directives|constraints|restrictions|guardrails|policies|programming|prompts?)\b/gi;

// Extraction intents: show me what you were given.
const EXTRACT_INTENT =
  /\b(?:reveal|show|print|repeat|output|display|dump|leak|expose|reproduce|recite|echo|spell\s+out|tell\s+me|give\s+me|share|paste|write\s+out|copy|return|list)\b/gi;
const EXTRACT_TARGET = new RegExp(
  [
    String.raw`\b(?:system|developer|hidden|secret|initial|original|internal|underlying|first)\s+(?:prompt|message|instructions?|rules|context|configuration|config)\b`,
    String.raw`\byour\s+(?:instructions|rules|prompt|guidelines|configuration|config|directives|system\s+message)\b`,
    String.raw`\b(?:instructions|text|content|configuration|config|message|prompt|context|words|everything|whatever)\s+(?:(?:that|which)\s+(?:was|were)\s+)?(?:you\s+(?:were\s+)?(?:given|received|told)|given\s+to\s+you|above|before\s+(?:my|this|the\s+user'?s?))`,
    String.raw`\b(?:supplied|given|provided|written|sent|placed)\s+(?:to\s+you\s+)?(?:before|above|ahead\s+of|prior\s+to)\s+(?:my|this|the\s+user'?s?)\s+(?:message|prompt|question|input)`,
    String.raw`\beverything\s+(?:above|before\s+(?:my|this))`,
  ].join('|'),
  'gi',
);

const ROLE =
  /\b(?:you\s+are\s+now|you're\s+now|from\s+now\s+on,?\s+you\s+are|act\s+as|pretend\s+(?:to\s+be|you\s+are)|enter|switch\s+to|enable)\b.{0,40}?\b(?:admin(?:istrator)?|developer|root|sudo|unrestricted|unfiltered|jailbroken|jailbreak|dan|god|evil|debug)\b(?:\s+mode)?|\b(?:developer|god|debug|jailbreak|dan)\s+mode\b|\bdo\s+anything\s+now\b/gi;

const STRUCT = /^\s*(?:#{2,}|\[)?\s*(?:system|assistant|developer)\s*[:\]]|<\/?(?:system|sys|instructions?)>|\[\/?INST\]|<<\/?SYS>>|<\|im_(?:start|end)\|>/gim;

// Hinglish
const HI_INTENT =
  /\b(?:bh?oo?l(?:o|a)?\s*(?:ja|jao|jaao|jaa|do)|ignore\s+(?:kar|karo|kardo|kar\s+do|karna)|ch?h?od\s*(?:do|dena|de)|nazar\s*andaa?z\s*(?:karo|kar\s+do)|dikha(?:o|do|\s+do|ye)?|bata(?:o|do|\s+do|iye)?|bolo|sunao|likh\s*do|likho|print\s+kar(?:o|\s+do)?|de\s+do)\b/gi;
const HI_TARGET =
  /\b(?:(?:pichh?le|purane|upar\s+wale|upar\s+ke|pehle\s+wale|pehle\s+ke|apne|tumhare|aapke)\s+(?:(?:saare|sare|sab|all)\s+)?(?:instructions?|rules?|niyam|messages?|prompts?|baatein|guidelines)|(?:system|secret|hidden|chh?upa|chu?pa)\s*(?:prompt|instructions?)|(?:admin|developer)\s*mode|sab(?:ka|ke|ki)\s+(?:users?\s+(?:ka|ke|ki)\s+)?data|(?:doosre|dusre|baaki)\s+(?:users?|logo(?:n)?)\s+(?:ka|ke|ki)\s+data)\b/gi;
const HI_ROLE = /\b(?:ab\s+)?(?:tum|tu|aap)\s+(?:ab\s+)?(?:admin|developer|unrestricted|root)\s+(?:mode\s+)?(?:mein|me|ho|hai|hain)\b/gi;
const HI_DATA_DEMAND = /\bsab(?:ka|ke|ki)\s+(?:users?\s+(?:ka|ke|ki)\s+)?data\s+(?:do|de\s+do|dikhao|batao|chahiye)\b/gi;

const CROSS_USER =
  /\b(?:other|another|all|every|sab(?:ke)?|doosre|dusre)\s+(?:users?|employees?|customers?|people|logo?n?)(?:'s|'|\s+ka|\s+ke|\s+ki)?\s+(?:data|details|history|conversations?|chats?|messages?|records?|prompts?|queries|info(?:rmation)?)\b/gi;

// Phrasings that signal talking ABOUT attacks rather than performing one.
const META = /\b(?:what\s+is|what's|what\s+are|explain|why\s+(?:is|are|does)|how\s+(?:does|do|can|a|an|the|to\s+(?:detect|prevent|stop|write))|define|definition|example\s+of|examples\s+of|detect|prevent|defend|protect\s+against|is\s+called|kya\s+hota|kya\s+hai|samjhao|matlab)\b/i;
const QUOTES = /["“”'‘’`]/g;

function spans(re: RegExp, text: string): Span[] {
  re.lastIndex = 0;
  return [...text.matchAll(re)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
}

function pairs(intents: Span[], targets: Span[], after = 80, before = 60): Span[] {
  const out: Span[] = [];
  for (const i of intents) {
    for (const t of targets) {
      const gapAfter = t.start - i.end;
      const gapBefore = i.start - t.end;
      if ((gapAfter >= 0 && gapAfter <= after) || (gapBefore >= 0 && gapBefore <= before) || (t.start < i.end && t.end > i.start)) {
        out.push({ start: Math.min(i.start, t.start), end: Math.max(i.end, t.end) });
      }
    }
  }
  return out;
}

/** How many levels to lower a score: one for meta phrasing nearby, one for being inside quotes. */
function damping(text: string, s: Span): number {
  let levels = 0;
  const sentenceStart = Math.max(text.lastIndexOf('\n', s.start - 1), text.lastIndexOf('. ', s.start - 1), text.lastIndexOf('? ', s.start - 1)) + 1;
  if (META.test(text.slice(Math.max(sentenceStart, s.start - 80), s.start)) || META.test(text.slice(s.end, s.end + 40))) levels++;
  const before = text.slice(sentenceStart, s.start);
  const quotesBefore = (before.match(QUOTES) ?? []).length;
  if (quotesBefore % 2 === 1) levels++;
  return levels;
}

const LEVEL_DROP = [0, 0.25, 0.5];

interface Candidate extends Span {
  score: number;
  ruleId: string;
  dampable: boolean;
}

export function detectInjection(text: string, ctx: DetectorContext): Finding[] {
  const norm = normalise(text);
  const folded = leetFold(norm.text);
  const cands: Candidate[] = [];
  const add = (list: Span[], score: number, ruleId: string, dampable = true) => {
    for (const s of list) cands.push({ ...s, score, ruleId, dampable });
  };

  // Rules run on both the normalised and the leet-folded text (folding breaks words like "4ll" vs "all").
  for (const t of [norm.text, folded]) {
    add(pairs(spans(OVERRIDE_INTENT, t), spans(OVERRIDE_TARGET, t)), 0.9, 'inj.override');
    add(pairs(spans(EXTRACT_INTENT, t), spans(EXTRACT_TARGET, t)), 0.9, 'inj.extract');
    add(spans(ROLE, t), 0.9, 'inj.role');
    add(pairs(spans(HI_INTENT, t), spans(HI_TARGET, t)), 0.9, 'inj.override.hi');
    add(spans(HI_ROLE, t), 0.9, 'inj.role.hi');
    add(spans(HI_DATA_DEMAND, t), 0.9, 'inj.crossuser.hi');
    add(spans(STRUCT, t), 0.7, 'inj.struct', false);

    const cross = spans(CROSS_USER, t);
    const intents = [...spans(EXTRACT_INTENT, t), ...spans(HI_INTENT, t)];
    add(pairs(intents, cross), 0.85, 'inj.crossuser');

    for (const name of ctx.knownUsers ?? []) {
      if (!name || name === ctx.currentUser) continue;
      const re = new RegExp(`\\b${name}(?:'s|'|\\s+ka|\\s+ke|\\s+ki)?\\s+(?:data|history|conversations?|chats?|messages?|prompts?|queries)\\b`, 'gi');
      add(pairs(intents, spans(re, t)), 0.85, 'inj.crossuser.named');
    }

    // Target words alone are weak evidence (talking about prompts is normal).
    add(spans(EXTRACT_TARGET, t), 0.4, 'inj.target_only');
  }

  // A structural tell plus any other strong signal is stronger than either alone.
  const strong = cands.filter((c) => c.score >= 0.85);
  if (strong.length && cands.some((c) => c.ruleId === 'inj.struct')) {
    for (const c of cands) if (c.ruleId === 'inj.struct') c.score = 0.95;
  }

  const findings: Finding[] = [];
  for (const c of cands) {
    const score = c.dampable ? Math.max(0, c.score - LEVEL_DROP[Math.min(2, damping(norm.text, c))]) : c.score;
    if (score < 0.3) continue;
    const orig = toOriginal(norm.map, c.start, c.end, text);
    const via: Via = text.slice(orig.start, orig.end) === norm.text.slice(c.start, c.end) ? 'raw' : 'normalised';
    findings.push({ category: 'INJECTION', source: ctx.source, start: orig.start, end: orig.end, score: Number(score.toFixed(2)), ruleId: c.ruleId, via });
  }
  return dedupeInjection(findings);
}

/** Keep the highest-scoring finding among overlapping spans. */
function dedupeInjection(fs: Finding[]): Finding[] {
  const sorted = [...fs].sort((a, b) => b.score - a.score || a.start - b.start);
  const kept: Finding[] = [];
  for (const f of sorted) {
    if (!kept.some((k) => f.start < k.end && f.end > k.start)) kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function injectionScore(findings: Finding[]): number {
  return findings.filter((f) => f.category === 'INJECTION').reduce((m, f) => Math.max(m, f.score), 0);
}
