import { describe, expect, it } from 'vitest';
import { detectAll, summariseFindings, toFindingSummary } from '../src';
import { fake, syntheticAadhaar } from './fixtures';

describe('toFindingSummary', () => {
  it('keeps only category, source, via and ruleId', () => {
    const [f] = detectAll('PAN ABCPV1234K', { source: 'prompt' });
    expect(Object.keys(toFindingSummary(f)).sort()).toEqual(['category', 'ruleId', 'source', 'via']);
  });

  it('drops fields added to a finding later, so nothing leaks by accident', () => {
    const f = { category: 'PAN', source: 'prompt', via: 'raw', ruleId: 'pii.pan.format', start: 4, end: 14, score: 0.9, value: 'ABCPV1234K' } as never;
    expect(JSON.stringify(toFindingSummary(f))).not.toMatch(/ABCPV1234K|start|end|score/);
  });
});

describe('summariseFindings', () => {
  const a = syntheticAadhaar();
  const text = `Aadhaar ${a} and again ${a}, PAN ABCPV1234K, key ${fake.github()}`;
  const digest = summariseFindings(detectAll(text, { source: 'prompt' }));

  it('builds the API and audit fields', () => {
    expect(digest.categories).toEqual(['AADHAAR', 'PAN', 'SECRET']);
    expect(digest.counts).toEqual({ AADHAAR: 2, PAN: 1, SECRET: 1 });
    expect(digest.rule_ids).toContain('secret.github_token');
    expect(digest.via).toEqual(['raw']);
  });

  it('collapses duplicate summaries but keeps counts', () => {
    expect(digest.findings.filter((f) => f.category === 'AADHAAR')).toHaveLength(1);
  });

  it('carries no value, offset or score', () => {
    const json = JSON.stringify(digest);
    for (const v of [a, 'ABCPV1234K', fake.github()]) expect(json).not.toContain(v);
    expect(json).not.toMatch(/"start"|"end"|"score"/);
  });

  it('handles no findings', () => {
    expect(summariseFindings([])).toEqual({ findings: [], rule_ids: [], categories: [], counts: {}, via: [] });
  });
});
