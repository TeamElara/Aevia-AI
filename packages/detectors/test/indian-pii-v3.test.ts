import { describe, expect, it } from 'vitest';
import { detectAll, gstinCheckChar, gstinValid, verhoeffCheckDigit } from '../src';
import type { Category } from '../src';

// Detection v3 Indian identifiers. Every value is synthetic; each category has a benign lookalike.
const cats = (text: string) => detectAll(text, { source: 'prompt' }).filter((f) => f.score >= 0.6).map((f) => f.category);
const gst = (first14: string) => first14 + gstinCheckChar(first14);

const cases: Array<{ category: Category; hit: string[]; lookalike: string[] }> = [
  {
    category: 'UPI',
    hit: ['Send the advance to asha.r@okhdfcbank', 'UPI: ravi99@anybank'],
    lookalike: ['Escalations go to legal@acme', 'Tag the reviewer as @meera in the PR'],
  },
  {
    category: 'VOTER_ID',
    hit: ['Voter ID: XYZ4821736', 'मतदाता पहचान पत्र संख्या ABQ7302915'],
    lookalike: ['Invoice INV4821736 is due Friday', 'Ticket ABQ7302915 was closed'],
  },
  {
    category: 'PASSPORT',
    hit: ['Passport number K4827361 expires in 2031', 'पासपोर्ट नंबर M7302918'],
    lookalike: ['Order K4827361 shipped', 'Use model M7302918 for the printer'],
  },
  {
    category: 'DRIVING_LICENCE',
    hit: ['DL no. MH12 2014 0045821', 'Driving licence KA-05-2019-1234567'],
    lookalike: ['Build AB12 2014 0045821 passed', 'Batch 2019-1234567 is archived'],
  },
  {
    category: 'GSTIN',
    hit: [`GSTIN ${gst('27ABCPE1234F1Z')}`, `Bill to ${gst('07AAACR5055K1Z')}`],
    lookalike: [`Code ${gst('27ABCPE1234F1Z').slice(0, 14)}${gst('27ABCPE1234F1Z').endsWith('A') ? 'B' : 'A'}`, 'Ref 99ABCPE1234F1ZX'],
  },
  {
    category: 'VEHICLE',
    hit: ['Car number MH 12 AB 1234', 'Parking for KA01MJ2024', 'Challan on 22 BH 4521 AA'],
    lookalike: ['Room MH 12 floor 3', 'Version 12 AB build 1234567', 'MP3 player model 1234'],
  },
  {
    category: 'PHONE',
    hit: ['Call me on +91 987 654 3210', 'WhatsApp number 912-345-6789'],
    lookalike: ['Order 987-654-3210 shipped', 'Range 700 800 9000 metres'],
  },
  {
    category: 'BANK_ACCOUNT',
    hit: ['Account number 50100234567890 at HDFC', 'mera khata 123456789012 hai'],
    lookalike: ['Tracking id 50100234567890', 'Population 123456789012 estimated'],
  },
  {
    category: 'AADHAAR',
    hit: [`Aadhaar ${(() => { const b = '73918264501'; return b + verhoeffCheckDigit(b); })()}`],
    lookalike: [`Aadhaar ${(() => { const b = '73918264501'; const d = verhoeffCheckDigit(b); return b + ((Number(d) + 1) % 10); })()}`],
  },
];

describe('Indian identifiers (v3)', () => {
  for (const c of cases) {
    describe(c.category, () => {
      for (const t of c.hit) it(`finds: ${t}`, () => expect(cats(t)).toContain(c.category));
      for (const t of c.lookalike) it(`ignores lookalike: ${t}`, () => expect(cats(t)).not.toContain(c.category));
    });
  }

  it('GSTIN checksum', () => {
    expect(gstinValid(gst('29AAGCB7383J1Z'))).toBe(true);
    expect(gstinValid('29AAGCB7383J1Z0')).toBe(gstinCheckChar('29AAGCB7383J1Z') === '0');
  });
});
