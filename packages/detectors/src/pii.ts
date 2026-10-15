import { cardIssuer, gstinValid, luhnValid, verhoeffValid } from './checksums';
import type { Detector, Hit } from './types';

/** True if `re` matches within `radius` characters of [start, end). */
function near(text: string, start: number, end: number, re: RegExp, radius = 40): boolean {
  return re.test(text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius)));
}

const AADHAAR_CTX = /aadhaa?r|adhaa?r|\buid(ai)?\b|आधार/i;
const VID_CTX = /\bvid\b|virtual\s*id/i;
const PAN_CTX = /\bpan\b|permanent\s+account/i;
const PHONE_CTX = /phone|mobile|\bmob\b|contact|call|whats\s*app|\bph\b|\btel\b|\+91|number|no\.|फ़ोन|फोन|मोबाइल|नंबर|नम्बर/i;
const CARD_CTX = /card|credit|debit|\bcvv\b|expiry|visa|master|rupay/i;
const BANK_CTX = /a\/c|\bacc(oun)?t\b|account\s*(no|number)|bank|khata/i;
const UPI_CTX = /\bupi\b|gpay|google\s*pay|phone\s*pe|paytm|bhim/i;
const VOTER_CTX = /\bvoter\b|\bepic\b|election\s+(?:card|id)|matdata|मतदाता|वोटर/i;
const PASSPORT_CTX = /passport|पासपोर्ट/i;
const DL_CTX = /\bdl\b|driving|licen[cs]e|लाइसेंस/i;
const VEHICLE_CTX = /vehicle|\bcar\b|\bbike\b|scooter|gaa?di|registration|\breg\.?\s*no|number\s+plate|challan|\brc\b|गाड़ी/i;

// State and union-territory codes used on licences and number plates.
const STATE = '(?:AN|AP|AR|AS|BR|CH|CG|DD|DL|DN|GA|GJ|HR|HP|JH|JK|KA|KL|LA|LD|MP|MH|MN|ML|MZ|NL|OD|OR|PB|PY|RJ|SK|TN|TS|TG|TR|UP|UK|UA|WB)';

// 12 digits, first 2-9, optional consistent separator between 4-digit groups.
export const aadhaar: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\d])([2-9]\d{3})([ \-./_]?)(\d{4})\2(\d{4})(?![\d])/g)) {
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
  // "A B C P V 1 2 3 4 K" / "ABCPV-1234-K": separators inside the PAN, only with PAN context.
  for (const m of text.matchAll(/(?<![A-Za-z0-9])[A-Za-z](?:[ \-.]?[A-Za-z]){2}[ \-.]?[PCHFATBLJGpchfatbljg][ \-.]?[A-Za-z](?:[ \-.]?\d){4}[ \-.]?[A-Za-z](?![A-Za-z0-9])/g)) {
    if (!/[ \-.]/.test(m[0])) continue;
    const start = m.index!;
    const end = start + m[0].length;
    if (near(text, start, end, PAN_CTX)) hits.push({ category: 'PAN', start, end, score: 0.9, ruleId: 'pii.pan.separated_ctx' });
  }
  return hits;
};

// Indian mobile: optional +91/91/0, then 10 digits starting 6-9, optionally split 5-5.
export const phone: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\d+])(?:(?:\+|00)?91[ \-]?|0)?[6-9]\d{4}[ \-.]?\d{5}(?!\d)/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, PHONE_CTX, 30);
    const prefixed = /^(\+|00)?91|^0/.test(m[0]);
    hits.push({ category: 'PHONE', start, end, score: ctx || prefixed ? 0.95 : 0.8, ruleId: ctx || prefixed ? 'pii.phone.ctx' : 'pii.phone.format' });
  }
  // "+91 987 654 3210": 3-3-4 grouping, only with the country code or phone context.
  for (const m of text.matchAll(/(?<![\d+])(?:(?:\+|00)91[ \-]?)?[6-9]\d{2}[ \-.]\d{3}[ \-.]\d{4}(?!\d)/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (/^(\+|00)91/.test(m[0]) || near(text, start, end, PHONE_CTX, 30)) hits.push({ category: 'PHONE', start, end, score: 0.95, ruleId: 'pii.phone.grouped' });
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

// Handles of UPI apps and banks (NPCI). Without a UPI context word, only these count: "security@company"
// in a policy answer is an internal address, not a UPI ID (H-030 pattern).
const UPI_HANDLES = new Set([
  'ybl', 'ibl', 'axl', 'okhdfcbank', 'okaxis', 'oksbi', 'okicici', 'okbizaxis', 'paytm', 'ptyes', 'ptaxis', 'pthdfc', 'ptsbi',
  'apl', 'yapl', 'rapl', 'upi', 'icici', 'sbi', 'hdfcbank', 'axisbank', 'axisb', 'kotak', 'kmbl', 'yesbank', 'yesbankltd',
  'freecharge', 'fbl', 'airtel', 'jio', 'idfcbank', 'idfcfirst', 'indus', 'federal', 'fam', 'waicici', 'wahdfcbank',
  'waaxis', 'wasbi', 'abfspay', 'slice', 'jupiteraxis', 'naviaxis', 'superyes', 'kbl', 'cnrb', 'pnb', 'barodampay',
  'unionbankofindia', 'ubi', 'boi', 'aubank', 'dbs', 'rbl', 'ikwik', 'pingpay', 'timecosmos', 'dlb', 'equitas', 'mahb',
]);

// handle@provider with no dot after the provider, so plain emails don't match.
export const upi: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/(?<![\w.\-])[\w.\-]{2,256}@([a-zA-Z]{2,64})(?![\w.\-]*\.[a-zA-Z])(?![\w@])/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, UPI_CTX);
    const known = UPI_HANDLES.has(m[1].toLowerCase());
    if (!ctx && !known) continue;
    hits.push({ category: 'UPI', start, end, score: ctx ? 0.9 : 0.85, ruleId: ctx ? 'pii.upi.ctx' : 'pii.upi.handle' });
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

// Reserved for documentation (RFC 2606, RFC 6761): never a real person's address (H-041 pattern).
const RESERVED_EMAIL_DOMAIN = /@(?:[\w\-]+\.)*(?:example\.(?:com|net|org)|example|test|invalid|localhost)$/i;

// Voter ID (EPIC): 3 letters + 7 digits. The shape matches many codes (INV1234567), so only with context.
export const voterId: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/\b[A-Z]{3}\d{7}\b/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (near(text, start, end, VOTER_CTX)) hits.push({ category: 'VOTER_ID', start, end, score: 0.95, ruleId: 'pii.voter_id.ctx' });
  }
  return hits;
};

// Indian passport: a letter (not Q, X, Z) + 7 digits, first and last digit non-zero. Only with context.
export const passport: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/\b[A-PR-WY][1-9]\d{5}[1-9]\b/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (near(text, start, end, PASSPORT_CTX)) hits.push({ category: 'PASSPORT', start, end, score: 0.95, ruleId: 'pii.passport.ctx' });
  }
  return hits;
};

// Driving licence: state code + 2-digit RTO + year of issue + 7 digits, e.g. "MH12 2011 0012345".
export const drivingLicence: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(new RegExp(`\\b${STATE}[ \\-]?\\d{2}[ \\-]?(?:19[5-9]\\d|20[0-4]\\d)[ \\-]?\\d{7}\\b`, 'g'))) {
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, DL_CTX);
    hits.push({ category: 'DRIVING_LICENCE', start, end, score: ctx ? 0.95 : 0.85, ruleId: ctx ? 'pii.dl.ctx' : 'pii.dl.format' });
  }
  return hits;
};

// GSTIN: state code 01-38 + PAN + entity number + Z + check character. A proprietor's GSTIN holds their PAN.
export const gstin: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/\b(?:0[1-9]|[12]\d|3[0-8])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g)) {
    if (!gstinValid(m[0])) continue;
    hits.push({ category: 'GSTIN', start: m.index!, end: m.index! + m[0].length, score: 0.95, ruleId: 'pii.gstin.checksum' });
  }
  return hits;
};

// Number plates: "MH 12 AB 1234", "KA01MJ2024", and Bharat series "22 BH 1234 AA".
export const vehicle: Detector = (text) => {
  const hits: Hit[] = [];
  const re = new RegExp(`\\b${STATE}[ \\-]?\\d{1,2}[ \\-]?[A-Z]{1,3}[ \\-]?\\d{4}\\b|\\b\\d{2}[ \\-]?BH[ \\-]?\\d{4}[ \\-]?[A-Z]{1,2}\\b`, 'g');
  for (const m of text.matchAll(re)) {
    const start = m.index!;
    const end = start + m[0].length;
    const ctx = near(text, start, end, VEHICLE_CTX);
    hits.push({ category: 'VEHICLE', start, end, score: ctx ? 0.9 : 0.8, ruleId: ctx ? 'pii.vehicle.ctx' : 'pii.vehicle.format' });
  }
  return hits;
};

export const email: Detector = (text) =>
  // Lookbehind + bounded parts: "\b[\w.+-]+@" rescans to the end from every word boundary.
  [...text.matchAll(/(?<![\w.+\-])[\w.+\-]{1,64}@[\w\-]{1,63}(?:\.[\w\-]{1,63}){0,8}\.[a-zA-Z]{2,24}\b/g)].filter((m) => !RESERVED_EMAIL_DOMAIN.test(m[0])).map((m) => ({
    category: 'EMAIL' as const,
    start: m.index!,
    end: m.index! + m[0].length,
    score: 0.6,
    ruleId: 'pii.email',
  }));

export const PII_DETECTORS: Detector[] = [aadhaar, vid, pan, phone, card, ifsc, upi, bankAccount, voterId, passport, drivingLicence, gstin, vehicle, email];
