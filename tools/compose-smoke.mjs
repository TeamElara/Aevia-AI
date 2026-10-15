import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const compose = (...args) => execFileSync('docker', ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.verify.yml', ...args], { encoding: 'utf8' });
const base = 'http://127.0.0.1:8080';
const post = async (path, data, token) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
  assert.equal(res.status, 200, `HTTP boundary failed: ${path}`); return res.json();
};
assert.equal((await fetch(base + '/ready')).status, 200);
const token = (await post('/api/auth/login', { user: 'asha' })).token;
const rows = [];
for (const [id, message] of [['normal', 'Reply with one short greeting.'], ['mask', 'Write one short line about PAN ABCPA1234F.'], ['secret', 'Use AWS key AKIAIOSFODNN7EXAMPLE']]) {
  const r = await post('/api/chat', { message }, token);
  rows.push({ id, action: r.action, provider_calls: r.provider_calls, answer_nonempty: !!r.answer });
  if (id === 'normal') { assert.equal(r.provider_calls, 1); assert.ok(r.answer); }
  if (id === 'mask') { assert.equal(r.action, 'mask'); assert.equal(r.provider_calls, 1); assert.ok(!r.sent_to_model.includes('ABCPA1234F')); }
  if (id === 'secret') { assert.equal(r.action, 'block'); assert.equal(r.provider_calls, 0); }
}
const scan = await post('/v1/scan', { text: 'PAN ABCPA1234F', history: [] }, 'ls_demo_asha');
assert.ok(!scan.masked_text.includes('ABCPA1234F'));
const audit = compose('exec', '-T', 'mongo', 'mongosh', '--quiet', '--eval', 'JSON.stringify(db.getSiblingDB("aevia").audit_events.find().toArray())');
assert.ok(!audit.includes('ABCPA1234F')); assert.ok(!audit.includes('AKIAIOSFODNN7EXAMPLE'));
const identity = compose('exec', '-T', 'gateway', 'id', '-u').trim(); assert.notEqual(identity, '0');
const report = { at: new Date().toISOString(), source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: 'clean GitHub Ubuntu runner; real Docker Compose, Mongo and CPU Ollama', model: 'qwen2.5:0.5b',
  checks: { ready: true, real_inference: true, outbound_masking: true, secret_zero_calls: true, scan: true, audit_privacy: true, unprivileged_container: true }, rows };
mkdirSync('results/mahatva', { recursive: true }); writeFileSync('results/mahatva/compose-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log('Docker Compose: all seven smoke/boundary checks passed.');
