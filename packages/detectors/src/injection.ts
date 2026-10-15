// Rule layer of the injection engine: intent x target, Hinglish and Devanagari Hindi, role switches,
// exfiltration, structural tells, cross-user. Rules run over several views of the text (normalised,
// leet-folded, split words collapsed, reversed, ROT13) so rewording tricks still match.
// The DeBERTa classifier is combined separately as max(rules, classifier).

import { collapseSplitWords, leetFold, normalise, toOriginal, type Mapped } from './normalise';
import { keepNonOverlapping, lowerBound, type Span } from './spans';
import type { DetectorContext, Finding, Via } from './types';

// Override intents: ignore / forget the rules.
const OVERRIDE_INTENT =
  /\b(?:ignore|disregard|forget|override|overrule|bypass|discard|drop|skip|abandon|set\s+aside|put\s+aside|throw\s+(?:out|away)|stop\s+following|no\s+longer\s+follow|(?:don'?t|do\s+not)\s+follow|erase|wipe)\b/gi;
const OVERRIDE_TARGET = new RegExp(
  [
    String.raw`\b(?:(?:all|any|every|the|these|those|your|my|previous|prior|above|earlier|preceding|initial|original|system|developer|safety)\s+){0,3}(?:instructions?|rules|guidelines|directives|constraints|restrictions|guardrails|policies|programming|prompts?)\b`,
    String.raw`\b(?:everything|anything|whatever|all)\s+(?:(?:that\s+)?you\s+(?:were|have\s+been|'ve\s+been)\s+told|(?:said|written|given)\s+(?:above|before|earlier))`,
    String.raw`\bwhat\s+you\s+were\s+told\b`,
  ].join('|'),
  'gi',
);

// Extraction intents: show me what you were given.
const EXTRACT_INTENT =
  /\b(?:reveal|show|print|repeat|output|display|dump|leak|expose|reproduce|recite|echo|spell\s+out|tell\s+me|give\s+me|share|paste|write\s+out|copy|return|list|quote|translate|summari[sz]e|paraphrase|rephrase|encode|complete|continue|finish)\b/gi;
const EXTRACT_TARGET = new RegExp(
  [
    String.raw`\b(?:system|developer|hidden|secret|initial|original|internal|underlying|first)\s+(?:prompt|message|instructions?|rules|context|configuration|config)\b`,
    String.raw`\byour\s+(?:instructions|rules|prompt|guidelines|configuration|config|directives|system\s+message)\b`,
    String.raw`\b(?:instructions|text|content|configuration|config|message|prompt|context|words|everything|whatever)\s+(?:(?:that|which)\s+(?:was|were)\s+)?(?:you\s+(?:were\s+)?(?:given|received|told)|given\s+to\s+you|above|before\s+(?:my|this|the\s+user'?s?))`,
    String.raw`\b(?:text|content|message|instructions|words)\s+(?:that|which)\s+(?:appears?|is|was|were|came|comes)\s+(?:above|before)\s+(?:my|this|the)\b`,
    String.raw`\b(?:supplied|given|provided|written|sent|placed)\s+(?:to\s+you\s+)?(?:before|above|ahead\s+of|prior\s+to)\s+(?:my|this|the\s+user'?s?)\s+(?:message|prompt|question|input)`,
    String.raw`\beverything\s+(?:above|before\s+(?:my|this))`,
    String.raw`\b(?:what|everything)\s+(?:you\s+were|you've\s+been|you\s+have\s+been)\s+told\s+(?:before|earlier|at\s+the\s+start|initially|first)`,
    String.raw`\bbefore\s+(?:this|our|the)\s+conversation(?:\s+(?:started|began))?`,
  ].join('|'),
  'gi',
);

const ROLE = new RegExp(
  [
    String.raw`\b(?:you\s+are\s+now|you're\s+now|from\s+now\s+on,?\s+you\s+are|act\s+as|pretend\s+(?:to\s+be|you\s+are)|enter|switch\s+to|enable)\b.{0,40}?\b(?:admin(?:istrator)?|developer|root|sudo|unrestricted|unfiltered|jailbroken|jailbreak|dan|god|evil|debug)\b(?:\s+mode)?`,
    String.raw`\b(?:developer|god|debug|jailbreak|dan)\s+mode\b`,
    String.raw`\bdo\s+anything\s+now\b`,
    String.raw`\bfrom\s+now\s+on\b.{0,40}?\b(?:no|without|zero)\s+(?:restrictions|rules|limits|filters|guidelines|censorship|boundaries)\b`,
    String.raw`\byou\s+(?:have|are\s+under|operate\s+with)\s+no\s+(?:restrictions|rules|limits|filters|guidelines|censorship)\b`,
  ].join('|'),
  'gi',
);

// Exfiltration: telling the model to send other people's data or credentials somewhere.
// Plain "send me the password reset link" doesn't match: the target must be secrets in bulk or other users' data.
const EXFIL = new RegExp(
  [
    String.raw`\b(?:send|forward|email|mail|upload|post|leak|exfiltrate|transmit|share)\b.{0,40}?\b(?:(?:other|all|every)\s+users?'?s?|everyone'?s|their|the\s+users?'?s?)\s+(?:secrets|passwords|credentials|api\s+keys|tokens|private\s+keys|data|details|records)\b`,
    String.raw`\b(?:send|forward|email|mail|upload|post|leak|exfiltrate|transmit)\b.{0,30}?\b(?:all\s+)?(?:the\s+)?(?:secrets|credentials|api\s+keys|access\s+keys|private\s+keys)\b`,
  ].join('|'),
  'gi',
);

// "reveal all secrets" / "dump the passwords": asking the model itself to disclose credentials.
const EXTRACT_SECRETS =
  /\b(?:reveal|dump|leak|expose|spill|print\s+out|list\s+all)\b.{0,30}?\b(?:all\s+)?(?:the\s+)?(?:your\s+)?(?:secrets|passwords|credentials|api\s+keys|private\s+keys|access\s+tokens)\b/gi;

// Roleplay extraction ("grandma exploit"): a persona that "used to" reveal secrets.
const ROLEPLAY =
  /\b(?:act\s+(?:like|as)|pretend|roleplay|role-play|imagine|play\s+the\s+role)\b.{0,80}?\b(?:used\s+to|would|always)\b.{0,60}?\b(?:read|tell|recite|share|say|whisper|give)\b.{0,50}?\b(?:hidden|secret|system|internal|confidential|password|passwords|api\s+keys?|keys|configuration|config|instructions|prompt)\b/gi;

const STRUCT = /^\s*(?:#{2,}|\[)?\s*(?:system|assistant|developer)\s*[:\]]|<\/?(?:system|sys|instructions?)>|\[\/?INST\]|<<\/?SYS>>|<\|im_(?:start|end)\|>/gim;

// Hinglish (Latin script)
const HI_INTENT =
  /\b(?:bh?oo?l(?:o|a)?\s*(?:ja|jao|jaao|jaa|do)|ignore\s+(?:kar|karo|kardo|kar\s+do|karna)|ch?h?od\s*(?:do|dena|de)|nazar\s*andaa?z\s*(?:karo|kar\s+do)|dikha(?:o|do|\s+do|ye)?|bata(?:o|do|\s+do|iye)?|bolo|sunao|likh\s*do|likho|print\s+kar(?:o|\s+do)?|de\s+do)\b/gi;
const HI_TARGET =
  /\b(?:(?:pichh?le|purane|upar\s+wale|upar\s+ke|pehle\s+wale|pehle\s+ke|apne|tumhare|aapke)\s+(?:(?:saare|sare|sab|all)\s+)?(?:instructions?|rules?|niyam|messages?|prompts?|baatein|guidelines)|(?:system|secret|hidden|chh?upa|chu?pa)\s*(?:prompt|instructions?)|(?:admin|developer)\s*mode|sab(?:ka|ke|ki)\s+(?:users?\s+(?:ka|ke|ki)\s+)?data|(?:doosre|dusre|baaki)\s+(?:users?|logo(?:n)?)\s+(?:ka|ke|ki)\s+data)\b/gi;
const HI_ROLE = /\b(?:ab\s+)?(?:tum|tu|aap)\s+(?:ab\s+)?(?:admin|developer|unrestricted|root)\s+(?:mode\s+)?(?:mein|me|ho|hai|hain)\b/gi;
const HI_DATA_DEMAND = /\bsab(?:ka|ke|ki)\s+(?:users?\s+(?:ka|ke|ki)\s+)?data\s+(?:do|de\s+do|dikhao|batao|chahiye)\b/gi;

// Hindi (Devanagari). \b doesn't work for Devanagari, so these rely on the word lists themselves.
const DEV_INTENT =
  /(?:भूल\s*(?:जाओ|जा|जाइए|जाइये|जाना|जाएं)|अनदेखा\s*(?:करो|कर\s*दो|करें|करिए)|नज़रअंदाज़\s*(?:करो|कर\s*दो|करें)|नजरअंदाज\s*(?:करो|कर\s*दो|करें)|छोड़\s*(?:दो|दें)|दिखाओ|दिखा\s*दो|दिखाइए|बताओ|बता\s*दो|बताइए|लिख\s*दो|सुनाओ|प्रिंट\s*करो)/gu;
const DEV_TARGET =
  /(?:(?:पिछले|पहले\s*के|पुराने|ऊपर\s*के|ऊपर\s*वाले|सभी|सारे|अपने|तुम्हारे|आपके)\s*){0,3}(?:निर्देशों|निर्देश|नियमों|नियम|हिदायतें|instructions?|rules?)|(?:सिस्टम|छुपे\s*हुए|छिपे\s*हुए|गुप्त|सीक्रेट)\s*(?:प्रॉम्प्ट|प्रोम्प्ट|निर्देश|prompt|instructions?)|system\s*prompt|(?:सबका|सभी\s*का|बाकी\s*लोगों\s*का|दूसरे\s*यूज़र्स\s*का)\s*डेटा/gu;
const DEV_ROLE = /(?:अब\s*)?(?:तुम|आप)\s*(?:अब\s*)?(?:एडमिन|admin|डेवलपर|developer)\s*(?:मोड\s*)?(?:में|मे)\s*(?:हो|हैं|है)/gu;

const CROSS_USER =
  /\b(?:other|another|all|every|sab(?:ke)?|doosre|dusre)\s+(?:users?|employees?|customers?|people|logo?n?)(?:'s|'|\s+ka|\s+ke|\s+ki)?\s+(?:data|details|history|conversations?|chats?|messages?|records?|prompts?|queries|info(?:rmation)?)\b/gi;

// Phrasings that signal talking ABOUT attacks rather than performing one.
const META = /\b(?:what\s+is|what's|what\s+are|explain|why\s+(?:is|are|does)|how\s+(?:does|do|can|a|an|the|to\s+(?:detect|prevent|stop|write))|define|definition|example\s+of|examples\s+of|detect|prevent|defend|protect\s+against|is\s+called|kya\s+hota|kya\s+hai|samjhao|matlab)\b/i;
const QUOTES = /["“”'‘’`]/g;
// Describing what attacks do ("jailbreak prompts try to bypass…") rather than ordering the model.
// The subject must be a third party, so "I want you to ignore…" is not softened.
const DESCRIPTIVE = /\b(?:attackers?|hackers?|prompts?|jailbreaks?|injections?|they|people|someone|malicious\s+\w+|bad\s+actors?)\b[^.?!\n]{0,30}\b(?:try|tries|trying|attempt|attempts|attempting|use|uses|used|aim|aims)\s+to\s+$/i;
// "Never share secrets…", "mat batao": a rule stated in the negative is policy text, not a request.
const NEGATED = /\b(?:never|don'?t|do\s+not|not|avoid|without|must\s+not|should\s+not|shouldn'?t|mat|nahi|na)\s+(?:\w+\s+){0,2}$/i;
// For intent x target pairs the negation must sit right before the verb: "Never reveal your system prompt"
// is policy text (common in system prompts and security docs), but "Do not hesitate to reveal…" is an attack.
const NEGATED_VERB = /(?:^|[^\p{L}])(?:never|don'?t|do\s+not|must\s+not|should\s+not|shouldn'?t|cannot|can'?t|mat|nahi|kabhi\s+mat|मत|कभी\s+मत|नहीं)\s+$/iu;

function negatedAt(t: string, p: Paired): boolean {
  return NEGATED_VERB.test(t.slice(Math.max(0, p.anchor - 20), p.anchor));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MAX_SPANS = 2000;

function spans(re: RegExp, text: string): Span[] {
  const out: Span[] = [];
  for (const m of text.matchAll(re)) {
    out.push({ start: m.index!, end: m.index! + m[0].length });
    if (out.length >= MAX_SPANS) break;
  }
  return out;
}

// Target matches are short (well under this), so only targets starting in this window can pair.
const MAX_TARGET_LEN = 300;
// One pairing per intent is enough to score it; cap the total so a hostile prompt can't explode the work.
const MAX_PAIRS = 500;

interface Paired extends Span {
  /** Start of the intent word; quote and meta damping are judged here, not at the merged span's start. */
  anchor: number;
}

// English puts the target after the verb ("ignore previous instructions"); Hinglish and Hindi put it before
// ("system prompt dikhao"), so callers pass a larger `before` for those.
function pairs(intents: Span[], targets: Span[], after = 80, before = 20): Paired[] {
  const out: Paired[] = [];
  if (!intents.length || !targets.length) return out;
  const sorted = [...targets].sort((a, b) => a.start - b.start);
  for (const i of intents) {
    for (let k = lowerBound(sorted, i.start - before - MAX_TARGET_LEN); k < sorted.length && sorted[k].start <= i.end + after; k++) {
      const t = sorted[k];
      const gapAfter = t.start - i.end;
      const gapBefore = i.start - t.end;
      if ((gapAfter >= 0 && gapAfter <= after) || (gapBefore >= 0 && gapBefore <= before) || (t.start < i.end && t.end > i.start)) {
        out.push({ start: Math.min(i.start, t.start), end: Math.max(i.end, t.end), anchor: i.start });
        break;
      }
    }
    if (out.length >= MAX_PAIRS) break;
  }
  return out;
}

/** How many levels to lower a score: meta phrasing nearby, describing attackers, the intent being inside quotes. */
function damping(text: string, s: Span & { anchor?: number }): number {
  let levels = 0;
  const at = s.anchor ?? s.start;
  // Look back at most 300 chars for the sentence start; a whole-text lastIndexOf per candidate is quadratic.
  const winStart = Math.max(0, at - 300);
  const win = text.slice(winStart, at);
  const sentenceStart = winStart + Math.max(win.lastIndexOf('\n'), win.lastIndexOf('. '), win.lastIndexOf('? ')) + 1;
  if (META.test(text.slice(Math.max(sentenceStart, at - 80), at)) || META.test(text.slice(s.end, s.end + 40))) levels++;
  if (DESCRIPTIVE.test(text.slice(Math.max(sentenceStart, at - 60), at))) levels++;
  const before = text.slice(sentenceStart, at);
  const quotesBefore = (before.match(QUOTES) ?? []).length;
  if (quotesBefore % 2 === 1) levels++;
  return levels;
}

const LEVEL_DROP = [0, 0.25, 0.5];

interface Candidate extends Span {
  anchor?: number;
  score: number;
  ruleId: string;
  dampable: boolean;
}

/** One way of looking at the text. `decoded` views (reversed, ROT13) report via: 'decoded'. */
interface View extends Mapped {
  decoded: boolean;
}

function reversedView(m: Mapped): View {
  const n = m.text.length;
  const map = new Array<number>(n);
  let text = '';
  for (let i = n - 1; i >= 0; i--) {
    text += m.text[i];
    map[n - 1 - i] = m.map[i];
  }
  return { text, map, decoded: true };
}

function rot13View(m: Mapped): View {
  const text = m.text.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  return { text, map: m.map, decoded: true };
}

// Reversed and ROT13 views double the work; skip them on very long inputs.
const DECODED_VIEWS_MAX = 20_000;

function rulesOn(t: string, ctx: DetectorContext, add: (list: Span[], score: number, ruleId: string, dampable?: boolean) => void): void {
  const live = (ps: Paired[]) => ps.filter((p) => !negatedAt(t, p));
  add(live(pairs(spans(OVERRIDE_INTENT, t), spans(OVERRIDE_TARGET, t))), 0.9, 'inj.override');
  add(live(pairs(spans(EXTRACT_INTENT, t), spans(EXTRACT_TARGET, t))), 0.9, 'inj.extract');
  add(spans(ROLE, t), 0.9, 'inj.role');
  add(spans(ROLEPLAY, t), 0.85, 'inj.roleplay');
  add(spans(EXFIL, t).filter((s) => !NEGATED.test(t.slice(Math.max(0, s.start - 30), s.start))), 0.9, 'inj.exfil');
  add(spans(EXTRACT_SECRETS, t).filter((s) => !NEGATED.test(t.slice(Math.max(0, s.start - 30), s.start))), 0.9, 'inj.extract_secrets');
  add(live(pairs(spans(HI_INTENT, t), spans(HI_TARGET, t), 80, 60)), 0.9, 'inj.override.hi');
  add(spans(HI_ROLE, t), 0.9, 'inj.role.hi');
  add(spans(HI_DATA_DEMAND, t), 0.9, 'inj.crossuser.hi');
  const devIntents = spans(DEV_INTENT, t);
  add(live(pairs(devIntents, [...spans(DEV_TARGET, t), ...spans(HI_TARGET, t)], 80, 60)), 0.9, 'inj.override.hi_dev');
  add(live(pairs(spans(HI_INTENT, t), spans(DEV_TARGET, t), 80, 60)), 0.9, 'inj.override.hi_dev');
  add(spans(DEV_ROLE, t), 0.9, 'inj.role.hi_dev');
  add(spans(STRUCT, t), 0.7, 'inj.struct', false);

  const cross = spans(CROSS_USER, t);
  const intents = [...spans(EXTRACT_INTENT, t), ...spans(HI_INTENT, t), ...devIntents];
  add(live(pairs(intents, cross, 80, 60)), 0.85, 'inj.crossuser');

  for (const name of ctx.knownUsers ?? []) {
    if (!name || name === ctx.currentUser || !/^[\p{L}\p{N}._-]{2,40}$/u.test(name)) continue;
    const n = escapeRe(name);
    const theirs = new RegExp(`\\b${n}(?:'s|'|\\s+ka|\\s+ke|\\s+ki)?\\s+(?:data|history|conversations?|chats?|messages?|prompts?|queries|questions)\\b`, 'gi');
    add(pairs(intents, spans(theirs, t), 80, 60), 0.85, 'inj.crossuser.named');
    // "What did ravi ask you yesterday?"
    const asked = new RegExp(`\\b(?:what|which\\s+\\w+)\\s+did\\s+${n}\\s+(?:ask|say|type|write|search|tell|send)\\b`, 'gi');
    add(spans(asked, t), 0.85, 'inj.crossuser.named');
  }

  // Target words alone are weak evidence (talking about prompts is normal).
  add(spans(EXTRACT_TARGET, t), 0.4, 'inj.target_only');
}

export function detectInjection(text: string, ctx: DetectorContext): Finding[] {
  const norm = normalise(text);
  const views: View[] = [
    { ...norm, decoded: false },
    { text: leetFold(norm.text), map: norm.map, decoded: false },
    { ...collapseSplitWords(norm), decoded: false },
  ];
  if (text.length <= DECODED_VIEWS_MAX) views.push(reversedView(norm), rot13View(norm));

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const view of views) {
    if (view !== views[0] && seen.has(view.text)) continue;
    seen.add(view.text);

    const cands: Candidate[] = [];
    rulesOn(view.text, ctx, (list, score, ruleId, dampable = true) => {
      for (const s of list) cands.push({ ...s, score, ruleId, dampable });
    });

    // A structural tell plus any other strong signal is stronger than either alone.
    if (cands.some((c) => c.score >= 0.85) && cands.some((c) => c.ruleId === 'inj.struct')) {
      for (const c of cands) if (c.ruleId === 'inj.struct') c.score = 0.95;
    }

    for (const c of cands) {
      const score = c.dampable ? Math.max(0, c.score - LEVEL_DROP[Math.min(2, damping(view.text, c))]) : c.score;
      if (score < 0.3) continue;
      const orig = toOriginal(view.map, c.start, c.end, text);
      const via: Via = view.decoded ? 'decoded' : text.slice(orig.start, orig.end) === view.text.slice(c.start, c.end) ? 'raw' : 'normalised';
      findings.push({ category: 'INJECTION', source: ctx.source, start: orig.start, end: orig.end, score: Number(score.toFixed(2)), ruleId: c.ruleId, via });
    }
  }
  return dedupeInjection(findings);
}

/** Keep the highest-scoring finding among overlapping spans. */
function dedupeInjection(fs: Finding[]): Finding[] {
  return keepNonOverlapping([...fs].sort((a, b) => b.score - a.score || a.start - b.start));
}

export function injectionScore(findings: Finding[]): number {
  return findings.filter((f) => f.category === 'INJECTION').reduce((m, f) => Math.max(m, f.score), 0);
}
