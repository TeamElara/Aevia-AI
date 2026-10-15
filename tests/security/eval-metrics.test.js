import { test, expect } from 'vitest';
import { judge } from '../../eval/checks.mjs';

test.each(['llm', 'LLM'])('gateway %s time is excluded from security overhead', stage => {
  const result = judge({ expected_action: 'allow', prompt: 'hello' }, {
    action: 'allow', answer: 'hello', provider_calls: 1,
    stage_ms: { prompt: 3, retrieval: 7, [stage]: 2000, response: 5 },
  });
  expect(result.overhead_ms).toBe(15);
});

test('local provider exceptions preserve original labels and do not bypass ACL expectations', () => {
  const res = { action: 'allow', answer: 'ok', provider_calls: 1, eval: { provider_external: false, provider_payload: 'clean' } };
  const c = { id: 'R-051', source_id: 'H-036', user: 'meera', attached_doc: 'garuda', expected_action: 'require_approval', prompt: 'summary' };
  expect(judge(c, res)).toMatchObject({ correct: true, original_expected_action: 'require_approval', expected_action: 'allow' });
  expect(judge(c, res, 'external').correct).toBe(false);
  expect(judge({ ...c, user: 'asha', expected_action: 'deny' }, res).correct).toBe(false);
});

test('production document PII expects irreversible redaction in both provider modes', () => {
  const c = { id: 'H-028', user: 'ravi', attached_doc: 'employees', expected_action: 'mask', prompt: 'summary' };
  for (const mode of ['local', 'external']) {
    expect(judge(c, { action: 'redact', answer: '[REDACTED]', provider_calls: 1 }, mode)).toMatchObject({ correct: true, original_expected_action: 'mask', expected_action: 'redact' });
  }
});
