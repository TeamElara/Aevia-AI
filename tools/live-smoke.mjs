/** Real provider smoke checks; saves metadata only. Configure SMOKE_URL/SMOKE_NAME. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const base = process.env.SMOKE_URL ?? 'http://127.0.0.1:8082';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Loopback verification only');
const rows = [], tokens = new Map();
const post = async (path, body, token) => {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  assert.equal(response.status, 200, `HTTP boundary: ${path}`); return response.json();
};
const tokenFor = async user => { if (!tokens.has(user)) tokens.set(user, (await post('/api/auth/login', { user })).token); return tokens.get(user); };
const chat = async (id, user, message, extra = {}) => {
  const started = performance.now(); const result = await post('/api/chat', { message, ...extra }, await tokenFor(user));
  rows.push({ id, action: result.action, provider_calls: result.provider_calls, answer_nonempty: !!result.answer, wall_ms: performance.now() - started });
  console.log(`${id}: ${result.action}, calls=${result.provider_calls}`); return result;
};
assert.equal((await fetch(base + '/ready')).status, 200);
const normal = await chat('normal', 'asha', 'Reply with one short greeting.');
assert.equal(normal.provider_calls, 1); assert.ok(normal.answer);
const masked = await chat('mask', 'asha', 'Write one short confirmation for PAN ABCPA1234F.');
assert.equal(masked.action, 'mask'); assert.equal(masked.provider_calls, 1); assert.ok(!masked.sent_to_model.includes('ABCPA1234F'));
const secret = await chat('secret', 'asha', 'Use AWS key AKIAIOSFODNN7EXAMPLE');
assert.equal(secret.action, 'block'); assert.equal(secret.provider_calls, 0);
const denied = await chat('employee-acl', 'asha', 'Summarise salary bands.', { attached_doc: 'salary' });
assert.equal(denied.action, 'deny'); assert.equal(denied.provider_calls, 0);
const allowed = await chat('hr-acl', 'ravi', 'Summarise salary bands in one short sentence.', { attached_doc: 'salary' });
assert.equal(allowed.provider_calls, 1); assert.ok(allowed.citations.some(c => c.doc_id === 'salary'));
const scan = await post('/v1/scan', { text: 'PAN ABCPA1234F', history: [] }, 'ls_demo_asha');
assert.ok(!scan.masked_text.includes('ABCPA1234F'));
const response = await post('/v1/chat/completions', { model: 'leakshield', messages: [{ role: 'user', content: 'Reply with one short greeting.' }] }, 'ls_demo_asha');
assert.equal(response.leakshield.provider_calls, 1); assert.ok(response.choices[0].message.content);
const report = { at: new Date().toISOString(), platform: `${process.platform}/${process.arch}`, node: process.version,
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  provider: process.env.SMOKE_NAME ?? 'real Windows Ollama qwen2.5:0.5b',
  checks: { real_inference: true, masking: true, secret_zero_calls: true, employee_acl: true, hr_acl: true, scan: true, compatible_completion: true }, rows,
  scope: 'Authored development smoke cases through the actual production HTTP server, real provider and temporary seeded Mongo; not frozen accuracy.' };
mkdirSync('results/mahatva', { recursive: true }); writeFileSync(`results/mahatva/${process.env.SMOKE_FILE ?? 'windows-ollama'}.json`, JSON.stringify(report, null, 2) + '\n');
console.log('Seven real-provider smoke/boundary checks passed.');
