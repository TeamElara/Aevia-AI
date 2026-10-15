// Undo disguises before detection, keeping a map back to the original text.
// map[i] is the index in the original string of normalised character i.

export interface Mapped {
  text: string;
  map: number[];
}

const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/;

// Cyrillic and Greek letters that render like Latin ones.
const HOMOGLYPHS: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  ѕ: 's', і: 'i', ї: 'i', ј: 'j', ԁ: 'd', ɡ: 'g', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w', ь: 'b',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X',
  Ѕ: 'S', І: 'I', Ј: 'J',
  α: 'a', β: 'b', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
};

// Zero code points of the Indian and Arabic-Indic digit blocks; NFKC leaves these alone.
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66];

function asciiDigit(cp: number): string | null {
  for (const z of DIGIT_ZEROS) if (cp >= z && cp <= z + 9) return String(cp - z);
  return null;
}

/**
 * NFKC per character, drop invisible characters, map homoglyphs and Indian-script digits,
 * spell out number words, join spread-out digit runs.
 */
export function normalise(input: string): Mapped {
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < input.length; ) {
    const cp = input.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    if (!INVISIBLE.test(ch)) {
      for (const c of ch.normalize('NFKC')) {
        const h = asciiDigit(c.codePointAt(0)!) ?? HOMOGLYPHS[c] ?? c;
        for (let k = 0; k < h.length; k++) {
          out.push(h[k]);
          map.push(i);
        }
      }
    }
    i += ch.length;
  }
  return joinSpreadDigits(joinNumberWords({ text: out.join(''), map }));
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  shunya: '0', shoonya: '0', ek: '1', do: '2', teen: '3', char: '4', chaar: '4', paanch: '5', panch: '5',
  chhe: '6', chhah: '6', che: '6', saat: '7', aath: '8', nau: '9',
};
const NUMBER_WORD = Object.keys(NUMBER_WORDS).join('|');
// 10+ number words in a row is a spelled-out phone/Aadhaar/card, not prose.
const NUMBER_WORD_RUN = new RegExp(`\\b(?:${NUMBER_WORD})(?:[\\s,\\-]+(?:${NUMBER_WORD})){9,18}\\b`, 'gi');

// "nine eight seven six five four three two one zero" -> "9876543210"
function joinNumberWords(m: Mapped): Mapped {
  const runs = [...m.text.matchAll(NUMBER_WORD_RUN)];
  if (runs.length === 0) return m;
  const out: string[] = [];
  const map: number[] = [];
  let pos = 0;
  for (const r of runs) {
    for (; pos < r.index!; pos++) {
      out.push(m.text[pos]);
      map.push(m.map[pos]);
    }
    for (const w of r[0].matchAll(/[A-Za-z]+/g)) {
      out.push(NUMBER_WORDS[w[0].toLowerCase()]);
      map.push(m.map[r.index! + w.index!]);
    }
    pos = r.index! + r[0].length;
  }
  for (; pos < m.text.length; pos++) {
    out.push(m.text[pos]);
    map.push(m.map[pos]);
  }
  return { text: out.join(''), map };
}

/**
 * For injection matching only: undo words split by separators or spaces.
 * "i.g.n.o.r.e" / "ig-nore" -> "ignore"; "i g n o r e" -> "ignore".
 */
export function collapseSplitWords(m: Mapped): Mapped {
  const drop = new Set<number>();
  for (const s of m.text.matchAll(/(?<=[\p{L}\p{M}])[.\-_*·•~|/]+(?=\p{L})/gu)) {
    for (let k = 0; k < s[0].length; k++) drop.add(s.index! + k);
  }
  for (const s of m.text.matchAll(/(?<![\p{L}\p{M}])\p{L}(?: \p{L}){3,}(?![\p{L}\p{M}])/gu)) {
    for (let k = 0; k < s[0].length; k++) if (s[0][k] === ' ') drop.add(s.index! + k);
  }
  if (drop.size === 0) return m;
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < m.text.length; i++) {
    if (drop.has(i)) continue;
    out.push(m.text[i]);
    map.push(m.map[i]);
  }
  return { text: out.join(''), map };
}

// "2 3 4 5 . 6 7 8 9 - 0 1 2 4" -> "234567890124".
// Only runs of 10-19 digits that contain a group shorter than 3 digits are joined;
// normal groupings like "2345 6789 0124" are already caught on the raw text.
function joinSpreadDigits(m: Mapped): Mapped {
  const drop = new Set<number>();
  for (const match of m.text.matchAll(/\d(?:[ \t.\-]{1,3}\d)+/g)) {
    const run = match[0];
    const digits = run.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 19) continue;
    const groups = run.split(/[ \t.\-]+/);
    if (!groups.some((g) => g.length < 3)) continue;
    for (let k = 0; k < run.length; k++) {
      if (!/\d/.test(run[k])) drop.add(match.index! + k);
    }
  }
  if (drop.size === 0) return m;
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < m.text.length; i++) {
    if (drop.has(i)) continue;
    out.push(m.text[i]);
    map.push(m.map[i]);
  }
  return { text: out.join(''), map };
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'l' };

/** Same-length leetspeak fold, for keyword matching only (it destroys numbers). */
export function leetFold(text: string): string {
  let out = '';
  for (const c of text) out += LEET[c] ?? c;
  return out;
}

/** Map a span in normalised text back to the original. Works for reversed maps too. */
export function toOriginal(map: number[], start: number, end: number, original: string): { start: number; end: number } {
  if (start >= map.length) return { start: original.length, end: original.length };
  const a = map[start];
  const b = map[Math.max(start, end - 1)];
  const s = Math.min(a, b);
  let last = Math.max(a, b);
  // A spelled-out digit maps to its word's first letter; extend to the end of that word so masking
  // "…one five" doesn't leave "ive" behind. Regex spans already end at word boundaries, so this is a no-op for them.
  if (/\p{L}/u.test(original[last] ?? '')) {
    while (last + 1 < original.length && /\p{L}/u.test(original[last + 1])) last++;
  }
  // Include the full code point at the last position.
  const cp = original.codePointAt(last);
  const width = cp !== undefined && cp > 0xffff ? 2 : 1;
  return { start: s, end: last + width };
}

export interface DecodedBlock {
  start: number;
  end: number;
  decoded: string;
  kind: 'base64' | 'hex' | 'url';
}

function mostlyPrintable(s: string): boolean {
  if (s.length < 8) return false;
  let ok = 0;
  for (const c of s) if (/[\p{L}\p{N}\p{P}\p{Zs}\n\r\t]/u.test(c)) ok++;
  return ok / [...s].length >= 0.9 && /\p{L}{3}/u.test(s);
}

// atob + TextDecoder instead of Buffer, so the package also runs in the browser extension.
const utf8 = new TextDecoder('utf-8', { fatal: false });

function fromBase64(s: string): string {
  const padded = s.length % 4 === 0 ? s : s + '='.repeat(4 - (s.length % 4));
  try {
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return utf8.decode(bytes);
  } catch {
    return '';
  }
}

function fromHex(s: string): string {
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return utf8.decode(bytes);
}

/** Find base64, hex and URL-encoded blocks and decode them, one level deep. */
export function decodeBlocks(text: string): DecodedBlock[] {
  const blocks: DecodedBlock[] = [];
  for (const m of text.matchAll(/(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{16,}={0,2}(?![A-Za-z0-9+/=])/g)) {
    if (/^[0-9a-fA-F]+$/.test(m[0])) continue;
    const decoded = fromBase64(m[0]);
    if (mostlyPrintable(decoded)) blocks.push({ start: m.index!, end: m.index! + m[0].length, decoded, kind: 'base64' });
  }
  for (const m of text.matchAll(/(?<![0-9a-fA-F])(?:[0-9a-fA-F]{2}){8,}(?![0-9a-fA-F])/g)) {
    const decoded = fromHex(m[0]);
    if (mostlyPrintable(decoded)) blocks.push({ start: m.index!, end: m.index! + m[0].length, decoded, kind: 'hex' });
  }
  // Tokenise first and count escapes per token; a single regex over \S* backtracks quadratically.
  for (const m of text.matchAll(/\S+/g)) {
    const token = m[0];
    let escapes = 0;
    for (const _ of token.matchAll(/%[0-9A-Fa-f]{2}/g)) if (++escapes >= 3) break;
    if (escapes < 3) continue;
    try {
      const decoded = decodeURIComponent(token);
      if (decoded !== token && mostlyPrintable(decoded)) {
        blocks.push({ start: m.index!, end: m.index! + token.length, decoded, kind: 'url' });
      }
    } catch {
      // malformed escape: not an encoded block
    }
  }
  return blocks;
}
