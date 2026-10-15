import { createHmac } from 'node:crypto';
function shingles(text, width) {
  const words = text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return Array.from({ length: Math.max(0, words.length - width + 1) }, (_, i) => words.slice(i, i + width).join(' '));
}
export function createFingerprinter(key, { width = 8, minimumMatches = 2 } = {}) {
  if (!key || Buffer.byteLength(key) < 32 || !Number.isInteger(width) || width < 2 || !Number.isInteger(minimumMatches) || minimumMatches < 1) throw new TypeError('Strong key and valid fingerprint parameters required');
  const digest = s => createHmac('sha256', key).update(s).digest('hex');
  return {
    fingerprint: text => [...new Set(shingles(text, width).map(digest))],
    matches(text, fingerprints) {
      const known = new Set(fingerprints);
      return new Set(shingles(text, width).map(digest).filter(hash => known.has(hash))).size >= minimumMatches;
    },
  };
}
