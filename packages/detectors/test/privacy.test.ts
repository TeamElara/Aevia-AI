import { describe, expect, it } from 'vitest';
import { detectAll, findSeededLeaks, seededValues } from '../src';
import { luhnValid } from '../src/checksums';

const seeds = Object.fromEntries(seededValues().map((s) => [s.label, s.value]));

describe('seeded values', () => {
  it('are detected by our own detectors (otherwise the privacy test proves nothing)', () => {
    const text = `Aadhaar ${seeds.aadhaar}, PAN ${seeds.pan}, phone ${seeds.phone}, card ${seeds.card}, key ${seeds.secret}`;
    const cats = new Set(detectAll(text, { source: 'prompt' }).map((f) => f.category));
    for (const c of ['AADHAAR', 'PAN', 'PHONE', 'CARD', 'SECRET']) expect(cats.has(c as never)).toBe(true);
    expect(luhnValid(seeds.card)).toBe(true);
  });
});

describe('findSeededLeaks', () => {
  it('finds values, including reformatted numbers and case changes', () => {
    const log = `user=u_1 aadhaar ${seeds.aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ')} pan=${seeds.pan.toLowerCase()}`;
    expect(findSeededLeaks(log).sort()).toEqual(['aadhaar', 'pan']);
  });

  it('is empty for a metadata-only audit event', () => {
    const event = JSON.stringify({ request_id: 'r_8c1f', user_pseudo: 'u_41ad', categories: ['AADHAAR', 'PAN'], action: 'mask', model_called: true });
    expect(findSeededLeaks(event)).toEqual([]);
  });

  it('returns labels, not values', () => {
    const out = findSeededLeaks(seeds.secret);
    expect(out).toEqual(['secret']);
    expect(JSON.stringify(out)).not.toContain(seeds.secret);
  });
});
