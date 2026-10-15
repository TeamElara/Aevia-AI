// Helpers for the privacy test (plan section 8): seed known synthetic values, run the scenarios,
// then assert none of them appear in audit records, incidents, approval metadata or logs.

import { verhoeffCheckDigit } from './checksums';

export interface SeededValue {
  label: string;
  value: string;
}

/** Five synthetic values: they look real to the detectors but belong to no one. */
export function seededValues(): SeededValue[] {
  const aadhaar11 = '73918264501';
  return [
    { label: 'aadhaar', value: aadhaar11 + verhoeffCheckDigit(aadhaar11) },
    { label: 'pan', value: 'QWEPZ4821M' },
    { label: 'phone', value: '9123487650' },
    { label: 'card', value: '4539578763621486' },
    { label: 'secret', value: 'gsk_' + 'Lk3'.repeat(14) },
  ];
}

/**
 * Labels of seeded values found anywhere in `haystack` (any string: serialised DB rows, log files, stderr).
 * Numbers are also matched with separators stripped, text values case-insensitively.
 * Returns labels, never the values, so a failing assertion doesn't print the secret.
 */
export function findSeededLeaks(haystack: string, values: SeededValue[] = seededValues()): string[] {
  const lower = haystack.toLowerCase();
  const digitsOnly = haystack.replace(/[\s\-.]/g, '');
  const found: string[] = [];
  for (const { label, value } of values) {
    const v = value.toLowerCase();
    if (lower.includes(v)) found.push(label);
    else if (/^\d+$/.test(value) && digitsOnly.includes(value)) found.push(label);
  }
  return found;
}
