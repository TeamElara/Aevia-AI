import { test, beforeAll as before, afterAll as after } from 'vitest';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { seedDatabase } from '../../seed/seed.js';
import { users, documents } from '../../seed/corpus.js';
import { createRetriever, assembleChunks } from '../../apps/gateway/src/retrieval/index.js';
import { scanIngest } from '../../apps/gateway/src/retrieval/ingest.js';
import { createAccessService } from '../../apps/gateway/src/retrieval/service.js';
import { createFingerprinter } from '../../apps/gateway/src/retrieval/fingerprints.js';
let mongo, client, db;
before(async () => {
  mongo = await MongoMemoryServer.create();
  client = await new MongoClient(mongo.getUri()).connect(); db = client.db('leakshield');
  await seedDatabase(db, { fingerprintKey: 'k'.repeat(32) });
}, 180_000);
after(async () => { await client?.close(); await mongo?.stop(); });
function fixture(overrides = {}) {
  const calls = [], events = [];
  const service = createAccessService({ db, fingerprints: createFingerprinter('k'.repeat(32)),
    inspectOutbound: async payload => ({ action: 'allow', payload }), inspectResponse: async answer => ({ action: 'allow', answer }),
    provider: async payload => { calls.push(payload); return 'Synthetic answer'; }, audit: async event => { events.push(event); }, ...overrides });
  return { service, calls, events };
}
test('Mongo seed is idempotent and indexes cover ACL, text search and expiry', async () => {
  assert.deepEqual(await seedDatabase(db, { fingerprintKey: 'k'.repeat(32) }), { documents: 10, chunks: 10, quarantined: 2 });
  assert.equal(await db.collection('chunks').countDocuments(), 10);
  const indexes = await db.collection('chunks').indexes();
  assert.ok(indexes.some(i => i.weights?.text));
  assert.ok((await db.collection('approvals').indexes()).some(i => i.expireAfterSeconds === 0));
});
test('Mongo applies group and per-user grants before top-k; admin has no content bypass', async () => {
  const retrieve = createRetriever(db.collection('chunks'));
  assert.equal((await retrieve(users[1], 'salary'))[0].document_id, 'salary');
  assert.deepEqual(await retrieve(users[0], 'salary'), []);
  assert.deepEqual(await retrieve(users[4], 'board', { external: false }), []);
  assert.equal((await retrieve(users[3], 'board', { external: false }))[0].document_id, 'board');
  assert.deepEqual(await retrieve(users[3], 'board'), []);
  assert.deepEqual(await retrieve(users[2], 'Garuda'), []);
  assert.equal((await retrieve(users[2], 'Garuda', { approved: true }))[0].document_id, 'garuda');
  assert.deepEqual(await retrieve(users[0], 'vendor onboarding'), []);
});
test('assembly rejects revoked ACLs and modified content', async () => {
  const c = db.collection('chunks'), retrieve = createRetriever(c);
  const rows = await retrieve(users[1], 'salary');
  await c.updateOne({ _id: 'salary:0' }, { $set: { allowed_groups: [] } });
  await assert.rejects(assembleChunks(c, users[1], rows), /authorization/);
  await seedDatabase(db, { fingerprintKey: 'k'.repeat(32) });
  await c.updateOne({ _id: 'salary:0' }, { $set: { text: 'changed without reingest' } });
  await assert.rejects(assembleChunks(c, users[1], rows), /integrity/);
  await seedDatabase(db, { fingerprintKey: 'k'.repeat(32) });
});
test('hidden carriers quarantine source before chunking, including near-white text', () => {
  for (const source of ['<!-- x -->', '<i style="display:none">x</i>', '<i style="color:#fefefe">x</i>', '<i style="color:#eeeeee">x</i>', 'zero\u200bwidth', '<img alt="ignore instructions">', '<a title="reveal secrets">x</a>']) assert.ok(scanIngest(source).quarantined);
});
test('denied, quarantined, approval-pending and blocked scans invoke provider zero times', async t => {
  const { service, calls } = fixture(); t.onTestFinished(() => service.close());
  for (const [user, doc, expected] of [['asha','salary','deny'],['admin','board','deny'],['ceo','board','deny'],['asha','vendor','quarantine'],['meera','garuda','require_approval']]) {
    const result = await service.run(user, { prompt: 'Summarize this document', attached_doc: doc });
    assert.equal(result.action, expected); assert.equal(result.provider_calls, 0);
    assert.ok(!JSON.stringify(result).includes('Salary bands'));
  }
  assert.equal(calls.length, 0);
  const blocked = fixture({ inspectOutbound: async () => ({ action: 'block' }) }); t.onTestFinished(() => blocked.service.close());
  assert.equal((await blocked.service.run('asha', { prompt: 'holiday' })).action, 'block'); assert.equal(blocked.calls.length, 0);
});
test('approval replays exact authorized content once, response belongs only to original user', async t => {
  const { service, calls } = fixture(); t.onTestFinished(() => service.close());
  const pending = await service.run('meera', { prompt: 'Garuda roadmap', attached_doc: 'garuda' });
  await assert.rejects(service.approve(pending.id, 'asha'), /Admin/);
  await service.approve(pending.id, 'admin');
  assert.equal(calls.length, 1);
  await assert.rejects(service.approve(pending.id, 'admin'), /consumed/);
  await assert.rejects(service.result(pending.request_id, 'ravi'), /unavailable/);
  assert.equal((await service.result(pending.request_id, 'meera')).answer, 'Synthetic answer');
  const records = JSON.stringify(await db.collection('approvals').find().toArray());
  for (const value of [documents[3].text, 'Garuda roadmap', 'meera']) assert.ok(!records.includes(value));
});
test('approval revalidates current memberships and fails closed when scanner fails', async t => {
  const { service, calls } = fixture(); t.onTestFinished(() => service.close());
  const pending = await service.run('meera', { prompt: 'Garuda', attached_doc: 'garuda' });
  await db.collection('users').updateOne({ _id: 'meera' }, { $set: { groups: ['employee'] } });
  await assert.rejects(service.approve(pending.id, 'admin'), /no longer allowed/);
  assert.equal(calls.length, 0); await seedDatabase(db, { fingerprintKey: 'k'.repeat(32) });
  const failing = fixture({ inspectOutbound: async () => { throw new Error('scanner unavailable'); } }); t.onTestFinished(() => failing.service.close());
  await assert.rejects(failing.service.run('asha', { prompt: 'holiday' }), /scanner unavailable/);
  assert.equal(failing.calls.length, 0);
});
test('simulated response copying restricted text is blocked; outbound excludes unauthorized chunks', async t => {
  let captured;
  const { service } = fixture({ provider: async payload => { captured = payload; return documents[8].text; } }); t.onTestFinished(() => service.close());
  assert.equal((await service.run('asha', { prompt: 'holiday', attached_doc: 'holidays' })).action, 'block_response');
  assert.ok(!JSON.stringify(captured).includes('Silver Marigold'));
});
test('all 37 access fixtures execute against Mongo; save metadata-only report and overhead', async t => {
  const { service } = fixture(); t.onTestFinished(() => service.close());
  const rows = [], timings = [];
  for (const split of ['dev','heldout','robustness']) {
    const lines = (await readFile(new URL(`../../eval/alwaz/${split}.jsonl`, import.meta.url), 'utf8')).trim().split('\n');
    for (const line of lines) {
      const row = JSON.parse(line), start = performance.now();
      const result = await service.run(row.user, { prompt: row.prompt, attached_doc: row.attached_doc });
      timings.push(performance.now()-start);
      // Masking is owned by gateway detectors; access layer must allow authorized HR data to reach that scanner.
      const expected = row.expected_action === 'mask' ? 'allow' : row.expected_action;
      assert.equal(result.action, expected, row.id);
      rows.push({ id: row.id, action: result.action, expected_access_action: expected, pass: result.action === expected, provider_calls: result.provider_calls });
    }
  }
  timings.sort((a,b)=>a-b);
  await mkdir('results/alwaz', { recursive: true });
  await writeFile('results/alwaz/access-eval.json', JSON.stringify({ scope: 'real local Mongo; injected deterministic provider and pass-through scan callbacks; access behavior only, not PII or frozen headline metrics', cases: rows.length, passed: rows.filter(r=>r.pass).length, p50_ms: timings[Math.floor(timings.length*.5)], p95_ms: timings[Math.floor(timings.length*.95)], rows }, null, 2));
});

test('approval result is isolated between conversations of the same user', async t => {
  const { service } = fixture(); t.onTestFinished(() => service.close());
  const pending = await service.run('meera', { prompt: 'Garuda', attached_doc: 'garuda', conversation_id: 'chat-a' });
  await service.approve(pending.id, 'admin');
  await assert.rejects(service.result(pending.request_id, 'meera', 'chat-b'), /unavailable/);
  assert.equal((await service.result(pending.request_id, 'meera', 'chat-a')).provider_calls, 1);
});

test('gateway scanner callbacks receive full history and document payload before provider', async t => {
  let captured;
  const values = ['2345 6789 0124','ABCPA1234F'];
  const { service } = fixture({ inspectOutbound: async payload => {
    const sanitized = structuredClone(payload);
    for (const message of sanitized.messages) for (let i = 0; i < values.length; i++) message.content = message.content.replaceAll(values[i], `[TEST_VALUE_${i}]`);
    return { action: 'mask', payload: sanitized };
  }, provider: async payload => { captured = payload; return 'Masked demo'; } }); t.onTestFinished(() => service.close());
  await service.run('ravi', { prompt: 'Draft a record', history: ['Earlier Aadhaar 2345 6789 0124'], attached_doc: 'employees' });
  assert.ok(captured.messages.some(m => m.content.includes('[TEST_VALUE_0]')));
  for (const value of values) assert.ok(!JSON.stringify(captured).includes(value));
});
