import { test, expect } from 'vitest';
import { judge } from '../../eval/checks.mjs';

test.each(['llm', 'LLM'])('gateway %s time is excluded from security overhead', stage => {
  const result = judge({ expected_action: 'allow', prompt: 'hello' }, {
    action: 'allow', answer: 'hello', provider_calls: 1,
    stage_ms: { prompt: 3, retrieval: 7, [stage]: 2000, response: 5 },
  });
  expect(result.overhead_ms).toBe(15);
});
