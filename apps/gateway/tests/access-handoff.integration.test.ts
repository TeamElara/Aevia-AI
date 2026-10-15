import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { loadAccessAdapter } from '../src/access-adapter.js';
import { Auth, issueToken } from '../src/auth.js';
import { Gateway } from '../src/pipeline.js';
import { employee, harness, secret } from './helpers.js';

const path = resolve(process.env.TEST_ACCESS_MODULE ?? 'apps/gateway/src/retrieval/index.js');
describe.skipIf(!existsSync(path))('published access hand-off with real MongoDB', () => {
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let access: Awaited<ReturnType<typeof loadAccessAdapter>>;
  const cleanups: (() => void)[] = [];
  const protectedText = 'Compensation records describe private salary bands and restricted individual bonus calculations for internal payroll reviewers only.';
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.0.16' } });
    client = new MongoClient(mongo.getUri()); await client.connect();
    const db = client.db('access-handoff');
    await db.collection('users').insertMany([{ _id: 'asha', id: 'asha', groups: ['employee'], roles: [] }, { _id: 'ravi', id: 'ravi', groups: ['employee', 'hr'], roles: [] }] as never);
    await db.collection('chunks').createIndex({ text: 'text', title: 'text' });
    const chunk = (id: string, text: string, groups: string[], extra = {}) => ({
      _id: id, document_id: id, title: id, text, allowed_groups: groups, allowed_users: [], classification: 'restricted',
      external_llm: 'allow', injection_score: 0, quarantined: false,
      content_hash: createHash('sha256').update(text).digest('hex'), ...extra,
    });
    await db.collection('chunks').insertMany([
      chunk('salary', protectedText, ['hr']),
      chunk('holiday', 'Holiday schedule includes a spring festival break.', ['employee'], { classification: 'internal' }),
      chunk('personal', 'Personal roadmap planning for a special task.', [], { allowed_users: ['asha'] }),
      chunk('external-deny', 'Deployment credentials policy reference.', ['employee'], { external_llm: 'deny' }),
    ] as never);
    access = await loadAccessAdapter(db, path, 'independent-fingerprint-test-key-32-characters');
  });
  afterAll(async () => { cleanups.forEach(fn => fn()); await client?.close(); await mongo?.stop(); });
  const setup = () => { const h = harness(); cleanups.push(h.close); return h; };
  it('maps factory chunks and enforces group ACLs inside retrieval', async () => {
    expect(await access.retrieve(employee, 'salary compensation')).toEqual([]);
    const result = await access.retrieve({ id: 'ravi', groups: ['hr'] }, 'salary compensation');
    expect(result[0]?.doc_id).toBe('salary'); expect(result[0]?.title).toBe('salary');
  });
  it('supports explicit per-user grants', async () => {
    expect((await access.retrieve(employee, 'personal roadmap'))[0]?.doc_id).toBe('personal');
    expect(await access.retrieve({ id: 'ravi', groups: ['hr'] }, 'personal roadmap')).toEqual([]);
  });
  it('reloads current memberships instead of trusting stale JWT groups', async () => {
    const token = await issueToken({ id: 'asha', groups: ['employee', 'hr'] }, secret);
    const auth = new Auth(secret, [], access.principal);
    expect((await auth.authenticate(`Bearer ${token}`)).groups).not.toContain('hr');
    expect(await access.retrieve({ id: 'asha', groups: ['hr'] }, 'salary')).toEqual([]);
  });
  it('detects restricted output overlap for an unauthorised user only', async () => {
    expect(await access.restrictedOverlap(protectedText, employee)).toBe(true);
    expect(await access.restrictedOverlap(protectedText, { id: 'ravi', groups: ['hr'] })).toBe(false);
  });
  it('rechecks hashes during assembly and fails on altered content', async () => {
    const db = client.db('access-handoff');
    await db.collection('chunks').updateOne({ _id: 'holiday' } as never, { $set: { text: 'Holiday altered text' } });
    await expect(access.retrieve(employee, 'holiday')).rejects.toThrow('Chunk integrity failure');
  });
  it('passes deny-external metadata to the gateway without accidentally sending the document', async () => {
    const h = setup(); const gateway = new Gateway({ ...h, ...access });
    const r = await gateway.run(employee, { messages: [{ role: 'user', content: 'Deployment credentials policy' }], attachedDoc: 'external-deny' });
    expect(r.action).toBe('deny'); expect(r.provider_calls).toBe(0);
  });
});
