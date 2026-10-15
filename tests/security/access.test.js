import { test } from 'vitest';
import assert from 'node:assert/strict';
import { documents, users } from '../../seed/corpus.js';
import { issueToken, verifyToken } from '../../seed/auth.js';
import { createFingerprinter } from '../../apps/gateway/src/retrieval/fingerprints.js';
import { createApprovals } from '../../apps/gateway/src/approvals/index.js';
const asha = users[0], ravi = users[1];
function approvals(overrides = {}) {
  const records = [], calls = [];
  const queue = createApprovals({ metadata: { async insertOne(row) { records.push(row); }, async updateOne(filter, change) { Object.assign(records.find(r => r._id === filter._id), change.$set); } },
    revalidate: async () => true, replay: async (payload, ctx) => { calls.push({ payload, ctx }); return payload; }, ...overrides });
  return { queue, records, calls };
}
const admin = users[4], ctx = { user: asha, request_id: 'request-test' };

test('restricted document fingerprints match copied passages without storing plaintext', () => {
  const f = createFingerprinter('x'.repeat(32)), text = documents[8].text;
  const values = f.fingerprint(text);
  assert.ok(f.matches(text, values));
  assert.ok(!f.matches('Unrelated onboarding and leave information', values));
  assert.ok(values.every(v => /^[a-f0-9]{64}$/.test(v)));
});
test('approval metadata has no payload; admin-only replay is single-use and exact', async t => {
  const { queue, records, calls } = approvals(); t.onTestFinished(() => queue.close());
  const payload = { messages: [{ content: 'synthetic-private-marker' }] };
  const { id } = await queue.enqueue(payload, ctx);
  assert.ok(!JSON.stringify(records).includes('synthetic-private-marker'));
  assert.ok(!JSON.stringify(records).includes('asha'));
  await assert.rejects(queue.approve(id, asha), /Admin/);
  const results = await Promise.allSettled([queue.approve(id, admin), queue.approve(id, admin)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(calls.length, 1); assert.deepEqual(calls[0], { payload, ctx });
  assert.throws(() => queue.list(asha), /Admin/);
});
test('expired, rejected and newly denied approvals never replay', async t => {
  let now = 100;
  const { queue, calls } = approvals({ now: () => now, ttlMs: 10 }); t.onTestFinished(() => queue.close());
  const first = await queue.enqueue({ secret: 'test' }, ctx); now = 110;
  await assert.rejects(queue.approve(first.id, admin), /expired/);
  const second = await queue.enqueue({}, ctx); await queue.reject(second.id, admin);
  await assert.rejects(queue.approve(second.id, admin), /consumed/);
  assert.equal(calls.length, 0);
  const denied = approvals({ revalidate: async () => false }); t.onTestFinished(() => denied.queue.close());
  const third = await denied.queue.enqueue({}, ctx);
  await assert.rejects(denied.queue.approve(third.id, admin), /no longer allowed/);
  assert.equal(denied.calls.length, 0);
});
test('JWT rejects forgery and expiration; membership resolves from current users', () => {
  const key = 's'.repeat(32), token = issueToken(asha, key, { now: 100_000, ttlSeconds: 10 });
  assert.deepEqual(verifyToken(token, key, users, { now: 101_000 }), asha);
  assert.throws(() => verifyToken(token, key, users, { now: 110_000 }), /claims/);
  const parts = token.split('.'); parts[1] = Buffer.from(JSON.stringify({ sub: 'ceo' })).toString('base64url');
  assert.throws(() => verifyToken(parts.join('.'), key, users, { now: 101_000 }), /JWT/);
  const revoked = users.map(u => ({ ...u, groups: [] }));
  assert.deepEqual(verifyToken(token, key, revoked, { now: 101_000 }).groups, []);
});

test('approval fails closed when persistence fails or validity expires during revalidation', async t => {
  let replayed = false;
  const broken = createApprovals({ metadata: { async insertOne() { throw new Error('database unavailable'); }, async updateOne() {} }, revalidate: async () => true, replay: async () => { replayed = true; } });
  t.onTestFinished(() => broken.close());
  await assert.rejects(broken.enqueue({}, ctx), /database unavailable/);
  assert.deepEqual(broken.list(admin), []);
  let now = 0;
  const expired = approvals({ now: () => now, ttlMs: 10, revalidate: async () => { now = 10; return true; } });
  t.onTestFinished(() => expired.queue.close());
  const { id } = await expired.queue.enqueue({}, ctx);
  await assert.rejects(expired.queue.approve(id, admin), /expired/);
  assert.equal(expired.calls.length, 0);
  assert.equal(replayed, false);
});

test('approval rejects mismatched request hashes without consuming a valid request', async t => {
  const { queue, records, calls } = approvals(); t.onTestFinished(() => queue.close());
  const { id } = await queue.enqueue({ x: 'synthetic' }, ctx);
  await assert.rejects(queue.approve(id, admin, 'wrong'), /hash mismatch/);
  await queue.approve(id, admin, records[0].request_hash);
  assert.equal(calls.length, 1);
});

test('optional ingest classifier quarantines whole document and fails closed on errors', async () => {
  const { ingestWithClassifier } = await import('../../apps/gateway/src/retrieval/ingest.js');
  const source = { ...documents[0], text: 'first safe chunk second suspicious chunk' };
  let count = 0;
  const chunks = await ingestWithClassifier(source, async () => ++count === 2 ? 0.99 : 0.01, { chunkSize: 10 });
  assert.ok(chunks.every(c => c.quarantined));
  await assert.rejects(ingestWithClassifier(source, async () => NaN), /invalid score/);
  await assert.rejects(ingestWithClassifier(source, async () => { throw new Error('model unavailable'); }), /model unavailable/);
});

test('HTTP route adapter requires authenticated identity and ignores body impersonation', async () => {
  const { registerAccessRoutes } = await import('../../apps/gateway/src/retrieval/routes.js');
  const routes = new Map(), calls = [];
  const app = { get(path, handler) { routes.set(`GET ${path}`, handler); }, post(path, handler) { routes.set(`POST ${path}`, handler); } };
  registerAccessRoutes(app, { async run(id, body) { calls.push({ id, body }); return { action: 'deny', provider_calls: 0 }; } });
  const handler = routes.get('POST /api/access/retrieve');
  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await handler({ body: { user: 'ceo', prompt: 'board' } }, response);
  assert.equal(response.statusCode, 401); assert.equal(calls.length, 0);
  await handler({ user: { id: 'asha' }, body: { user: 'ceo', prompt: 'board' } }, response);
  assert.equal(calls[0].id, 'asha'); assert.equal(response.body.action, 'deny');
});
