import { cardIssuer, luhnValid, verhoeffValid } from './checksums';
import type { Detector, Hit } from './types';

/** True if `re` matches within `radius` characters of [start, end). */
function near(text: string, start: number, end: number, re: RegExp, radius = 40): boolean {
  return re.test(text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius)));
}

const AADHAAR_CTX = /aadhaa?r|adhaa?r|\buid(ai)?\b|आधार/i;
const VID_CTX = /\bvid\b|virtual\s*id/i;
const PAN_CTX = /\bpan\b|permanent\s+account/i;
const PHONE_CTX = /phone|mobile|\bmob\b|contact|call|whats\s*app|\bph\b|\btel\b|\+91|number|no\./i;
const CARD_CTX = /card|credit|debit|\bcvv\b|expiry|visa|master|rupay/i;
const BANK_CTX = /a\/c|\bacc(oun)?t\b|account\s*(no|number)|bank|khata/i;
const UPI_CTX = /\bupi\b|gpay|google\s*pay|phone\s*pe|paytm|bhim/i;

// 12 digits, first 2-9, optional consistent separator between 4-digit groups.
export const aadhaar: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\d])([2-9]\d{3})([ \-.]?)(\d{4})\2(\d{4})(?![\d])/g)) {
    const digits = m[1] + m[3] + m[4];
    if (!verhoeffValid(digits)) continue;
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, AADHAAR_CTX);
    const grouped = m[2] !== '';
    if (ctx || grouped) {
      hits.push({ category: 'AADHAAR', start, end, score: ctx ? 0.97 : 0.9, ruleId: ctx ? 'pii.aadhaar.ctx' : 'pii.aadhaar.grouped' });
    } else {
      // Checksum alone: about 1 in 10 random numbers pass. Policy maps this to warn.
      hits.push({ category: 'AADHAAR', start, end, score: 0.5, ruleId: 'pii.aadhaar.checksum_only' });
    }
  }
  return hits;
};

// 16-digit Virtual ID, Verhoeff, only with context (otherwise it collides with cards).
export const vid: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\d])(\d{4})([ \-]?)(\d{4})\2(\d{4})\2(\d{4})(?![\d])/g)) {
    const digits = m[1] + m[3] + m[4] + m[5];
    const start = m.index!;
    const end = start + m[0].length;
    if (verhoeffValid(digits) && near(text, start, end, VID_CTX)) {
      hits.push({ category: 'VID', start, end, score: 0.95, ruleId: 'pii.vid.ctx' });
    }
  }
  return hits;
};

// 4th letter is the holder type: P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local, J juridical, G govt.
export const pan: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/\b[A-Za-z]{3}[PCHFATBLJGpchfatbljg][A-Za-z]\d{4}[A-Za-z]\b/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    const upper = m[0] === m[0].toUpperCase();
    const ctx = near(text, start, end, PAN_CTX);
    if (upper) hits.push({ category: 'PAN', start, end, score: ctx ? 0.97 : 0.9, ruleId: ctx ? 'pii.pan.ctx' : 'pii.pan.format' });
    else if (ctx) hits.push({ category: 'PAN', start, end, score: 0.85, ruleId: 'pii.pan.lowercase_ctx' });
  }
  return hits;
};

// Indian mobile: optional +91/91/0, then 10 digits starting 6-9, optionally split 5-5.
export const phone: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\d+])(?:(?:\+|00)?91[ \-]?|0)?[6-9]\d{4}[ \-]?\d{5}(?!\d)/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, PHONE_CTX, 30);
    const prefixed = /^(\+|00)?91|^0/.test(m[0]);
    hits.push({ category: 'PHONE', start, end, score: ctx || prefixed ? 0.95 : 0.8, ruleId: ctx || prefixed ? 'pii.phone.ctx' : 'pii.phone.format' });
  }
  return hits;
};

export const card: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\d])\d(?:[ \-]?\d){12,18}(?![\d])/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) continue;
    if (!luhnValid(digits) || !cardIssuer(digits)) continue;
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, CARD_CTX);
    hits.push({ category: 'CARD', start, end, score: ctx ? 0.97 : 0.9, ruleId: ctx ? 'pii.card.ctx' : 'pii.card.luhn_iin' });
  }
  return hits;
};

export const ifsc: Detector = (text) =>
  [...text.matchAll(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g)].map((m) => ({
    category: 'IFSC' as const,
    start: m.index!,
    end: m.index! + m[0].length,
    score: 0.7,
    ruleId: 'pii.ifsc',
  }));

// handle@provider with no dot after the provider, so plain emails don't match.
export const upi: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\w.\-])[\w.\-]{2,256}@[a-zA-Z]{2,64}(?![\w.\-]*\.[a-zA-Z])(?![\w@])/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, UPI_CTX);
    hits.push({ category: 'UPI', start, end, score: ctx ? 0.9 : 0.75, ruleId: ctx ? 'pii.upi.ctx' : 'pii.upi.format' });
  }
  return hits;
};

// Only with account context: a bare 9-18 digit number is too common.
export const bankAccount: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\d])\d{9,18}(?![\d])/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (near(text, start, end, BANK_CTX, 30)) {
      hits.push({ category: 'BANK_ACCOUNT', start, end, score: 0.85, ruleId: 'pii.bank_account.ctx' });
    }
  }
  return hits;
};

export const email: Detector = (text) =>
  // Lookbehind + bounded parts: "\b[\w.+-]+@" rescans to the end from every word boundary.
  [...text.matchAll(/(?<![\w.+\-])[\w.+\-]{1,64}@[\w\-]{1,63}(?:\.[\w\-]{1,63}){0,8}\.[a-zA-Z]{2,24}\b/g)].map((m) => ({
    category: 'EMAIL' as const,
    start: m.index!,
    end: m.index! + m[0].length,
    score: 0.6,
    ruleId: 'pii.email',
  }));

export const PII_DETECTORS: Detector[] = [aadhaar, vid, pan, phone, card, ifsc, upi, bankAccount, email];
