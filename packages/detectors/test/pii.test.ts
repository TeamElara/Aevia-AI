import { describe, expect, it } from 'vitest';
import { detectAll } from '../src';
import { luhnValid, verhoeffValid } from '../src/checksums';
import { badAadhaar, group444, syntheticAadhaar } from './fixtures';

const ctx = { source: 'prompt' as const };
const cats = (text: string) => detectAll(text, ctx).filter((f) => f.category !== 'INJECTION');
const only = (text: string, category: string) => cats(text).filter((f) => f.category === category);

describe('checksums', () => {
  it('verhoeff round-trips', () => {
    expect(verhoeffValid(syntheticAadhaar())).toBe(true);
    expect(verhoeffValid(badAadhaar())).toBe(false);
  });
  it('luhn', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });
});

describe('aadhaar', () => {
  const a = syntheticAadhaar();

  it('masks-level score with context', () => {
    const text = `Customer Aadhaar is ${a}, please verify.`;
    const [f] = only(text, 'AADHAAR');
    expect(f.score).toBeGreaterThanOrEqual(0.9);
    expect(f.ruleId).toBe('pii.aadhaar.ctx');
    expect(text.slice(f.start, f.end)).toBe(a);
  });

  it('masks-level score with 4-4-4 grouping and no context word', () => {
    const [f] = only(`Number: ${group444(a)}`, 'AADHAAR');
    expect(f.ruleId).toBe('pii.aadhaar.grouped');
    expect(f.score).toBeGreaterThanOrEqual(0.9);
  });

  it('only warns on a bare checksum-valid number (order IDs collide ~10% of the time)', () => {
    const [f] = only(`Order ${a} has shipped`, 'AADHAAR');
    expect(f.ruleId).toBe('pii.aadhaar.checksum_only');
    expect(f.score).toBeLessThan(0.6);
  });

  it('ignores a number that fails the checksum, even with context', () => {
    expect(only(`Aadhaar ${badAadhaar()}`, 'AADHAAR')).toHaveLength(0);
  });

  it('catches spread-out digits via the normaliser', () => {
    const spread = a.split('').join(' ').replace(/^(.{7})/, '$1 .');
    const text = `my aadhaar: ${spread}`;
    const f = only(text, 'AADHAAR')[0];
    expect(f).toBeDefined();
    expect(f.via).toBe('normalised');
    expect(text.slice(f.start, f.end).replace(/\D/g, '')).toBe(a);
  });

  it('ignores numbers starting with 0 or 1', () => {
    expect(only('Aadhaar 1234 5678 9012', 'AADHAAR')).toHaveLength(0);
  });
});

describe('pan', () => {
  it('finds a valid PAN', () => {
    expect(only('PAN ABCPV1234K', 'PAN')).toHaveLength(1);
  });
  it('rejects an invalid holder-type letter', () => {
    expect(only('code ABCXV1234K', 'PAN')).toHaveLength(0);
  });
  it('lowercase only with context', () => {
    expect(only('my pan is abcpv1234k', 'PAN')).toHaveLength(1);
    expect(only('ref abcpv1234k', 'PAN')).toHaveLength(0);
  });
});

describe('phone', () => {
  it('finds +91 numbers', () => {
    const [f] = only('Call me on +91 98765 43210', 'PHONE');
    expect(f.score).toBeGreaterThanOrEqual(0.9);
  });
  it('ignores short numbers and numbers starting 1-5', () => {
    expect(only('Invoice 12345', 'PHONE')).toHaveLength(0);
    expect(only('Ref 5123456789', 'PHONE')).toHaveLength(0);
  });
});

describe('financial', () => {
  it('finds a Luhn-valid card with a real issuer prefix', () => {
    expect(only('Card 4111 1111 1111 1111 exp 12/27', 'CARD')).toHaveLength(1);
  });
  it('ignores a Luhn-invalid number', () => {
    expect(only('Card 4111 1111 1111 1112', 'CARD')).toHaveLength(0);
  });
  it('finds IFSC and UPI, but not an email as UPI', () => {
    expect(only('IFSC HDFC0001234', 'IFSC')).toHaveLength(1);
    expect(only('pay to rahul@okhdfcbank on gpay', 'UPI')).toHaveLength(1);
    expect(only('mail rahul@gmail.com', 'UPI')).toHaveLength(0);
    expect(only('mail rahul@gmail.com', 'EMAIL')).toHaveLength(1);
  });
  it('bank account needs context', () => {
    expect(only('A/c no 50100123456789', 'BANK_ACCOUNT')).toHaveLength(1);
    expect(only('Tracking 50100123456789', 'BANK_ACCOUNT')).toHaveLength(0);
  });
});

describe('benign text', () => {
  it.each([
    'Can you help me write a cover letter for a data analyst role?',
    'The meeting is on 2026-10-15 at 3pm, budget ₹45,000.',
    'Order #4521 shipped to PIN 560001.',
    'Explain the difference between TCP and UDP.',
  ])('no data findings: %s', (text) => {
    expect(cats(text)).toHaveLength(0);
  });
});
