import { test, expect } from 'vitest';
import { freezeEvidence } from '../../eval/freeze.mjs';

test('an ordinary development run never claims a freeze', () => {
  expect(freezeEvidence()).toEqual({ frozen: false });
});
test('a freeze requires an existing ancestor and unchanged source', () => {
  const calls = [];
  const proof = freezeEvidence('eval-freeze-v2', (...args) => {
    calls.push(args); return args[0] === 'rev-parse' ? 'a'.repeat(40) : '';
  });
  expect(proof.frozen).toBe(true);
  expect(calls.map(c => c[0])).toEqual(['rev-parse', 'merge-base', 'diff']);
});
test('changed frozen source stops evaluation', () => {
  expect(() => freezeEvidence('eval-freeze-v2', (...args) => {
    if (args[0] === 'diff') throw new Error('source changed');
    return 'a'.repeat(40);
  })).toThrow('source changed');
});
