import { beforeAll, afterAll, test, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { seedDatabase } from '../../seed/seed.js';
import { users } from '../../seed/corpus.js';
import { createRetriever } from '../../apps/gateway/src/retrieval/index.js';
let mongo, client, db, retrieve;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create(); client = await new MongoClient(mongo.getUri()).connect(); db = client.db('relevance');
  await seedDatabase(db, { fingerprintKey: 'r'.repeat(32) }); retrieve = createRetriever(db.collection('chunks'));
}, 120000);
afterAll(async () => { await client?.close(); await mongo?.stop(); });
test('dev authoring and code-review prompts do not retrieve unrelated references', async () => {
  const cases = (await readFile('eval/dev.jsonl', 'utf8')).trim().split('\n').map(JSON.parse);
  for (const id of ['D-003', 'D-005', 'D-015']) {
    const c = cases.find(c => c.id === id);
    expect(await retrieve(users.find(user => user.id === c.user), c.prompt, { external: false }), id).toEqual([]);
  }
});
test('topical references rank by score, with ACLs applied before final top-k', async () => {
  const rows = await retrieve(users[1], 'salary bands', { limit: 1, external: false });
  expect(rows.map(c => c.document_id)).toEqual(['salary']); expect(rows[0].score).toBeGreaterThan(0);
  expect(await retrieve(users[0], 'salary bands', { limit: 1, external: false })).toEqual([]);
});
test('flagged references need two distinct query terms and remain subject to provider policy', async () => {
  expect(await retrieve(users[2], 'review', { external: false })).toEqual([]);
  expect(await retrieve(users[2], 'Garuda', { external: false })).toEqual([]);
  expect((await retrieve(users[2], 'Garuda roadmap', { external: false })).map(c => c.document_id)).toEqual(['garuda']);
  expect(await retrieve(users[2], 'Garuda roadmap')).toEqual([]);
  expect((await retrieve(users[3], 'board minutes', { external: false })).map(c => c.document_id)).toEqual(['board']);
  expect(await retrieve(users[3], 'board minutes')).toEqual([]);
  expect(await retrieve(users[4], 'board minutes', { external: false })).toEqual([]);
});
test('quarantined references remain excluded and relevance ratio is bounded', async () => {
  expect(await retrieve(users[0], 'vendor FAQ', { external: false })).toEqual([]);
  expect(() => createRetriever(db.collection('chunks'), { minimumScoreRatio: 2 })).toThrow('Invalid score ratio');
});
test('relevance outranks document IDs and weak eligible hits fall below the relative cutoff', async () => {
  const c = db.collection('chunks');
  const template = await c.findOne({ document_id: 'holidays' });
  await c.insertMany([
    { ...template, _id: 'a-weak', document_id: 'a-weak', title: 'Lunar notes', text: 'Guide to miscellaneous schedules and routine internal reference material for everyday administrative work.' },
    { ...template, _id: 'z-strong', document_id: 'z-strong', title: 'Lunar guide', text: 'Lunar guide lunar guide lunar guide.' },
  ]);
  try {
    const all = await createRetriever(c, { minimumScoreRatio: 0 })(users[0], 'lunar guide');
    expect(all.map(c => c.document_id)).toEqual(['z-strong', 'a-weak']);
    const selected = await retrieve(users[0], 'lunar guide');
    expect(selected.map(c => c.document_id)).toEqual(['z-strong']);
  } finally { await c.deleteMany({ _id: { $in: ['a-weak', 'z-strong'] } }); }
});
