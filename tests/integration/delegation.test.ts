import { afterAll, beforeAll, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createServer } from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { seedDatabase } from '../../seed/seed.js';
import { loadAccessAdapter } from '../../apps/gateway/src/access-adapter.js';
import { createApp } from '../../apps/gateway/src/app.js';
import { Audit, MongoAuditStore } from '../../apps/gateway/src/audit.js';
import { Auth } from '../../apps/gateway/src/auth.js';
import { Delegations } from '../../apps/gateway/src/delegation.js';
import { Gateway } from '../../apps/gateway/src/pipeline.js';
import { PolicyStore } from '../../apps/gateway/src/policy.js';
import { Scanner } from '../../apps/gateway/src/scanner.js';
import { ConversationVault } from '../../apps/gateway/src/vault.js';
import { HttpProvider } from '../../apps/gateway/src/provider.js';
import { detectAll } from '../../packages/detectors/src/index.js';

let mongo: any, client: any, db: any, upstream: any, base: any, policies: any, vault: any;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create(); client = await new MongoClient(mongo.getUri()).connect(); db = client.db('delegation');
  await seedDatabase(db, { fingerprintKey: 'f'.repeat(32) });
  const store = new MongoAuditStore(db); await store.initialise();
  const audit = new Audit(store, 'audit-' + randomBytes(32).toString('hex'));
  const delegations = new Delegations(db, audit); await delegations.initialise();
  const access = await loadAccessAdapter(db, resolve('apps/gateway/src/retrieval/index.js'), 'f'.repeat(32), id => delegations.lentTo(id));
  policies = new PolicyStore(resolve('apps/gateway/policy.yaml'), false); vault = new ConversationVault();
  upstream = createServer(async (req, res) => {
    for await (const _ of req) { /* drain */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Simulated provider answer.' } }] }));
  }).listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const provider = new HttpProvider({ kind: 'ollama', baseURL: `http://127.0.0.1:${upstream.address().port}/v1`, model: 'fixture' });
  const gateway = new Gateway({ scanner: new Scanner(detectAll as any), provider, audit, policies, vault, retrieve: access.retrieve, restrictedOverlap: access.restrictedOverlap, evalMode: true });
  base = request(createApp({ gateway, auth: new Auth('j'.repeat(32), [], access.principal), audit, policies, ready: () => true, demoAuth: true, signingSecret: 'j'.repeat(32), evalMode: true, delegations }));
}, 180_000);
afterAll(async () => { policies?.close(); vault?.close(); if (upstream) { upstream.closeAllConnections(); await new Promise<void>(r => upstream.close(() => r())); } await client?.close(); await mongo?.stop(); });
beforeEach(async () => { await db.collection('delegations').deleteMany({}); await seedDatabase(db, { fingerprintKey: 'f'.repeat(32) }); });

const login = async (user: string) => (await base.post('/api/auth/login').send({ user }).expect(200)).body.token as string;
const as = (token: string) => ({
  get: (path: string) => base.get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object) => base.post(path).set('Authorization', `Bearer ${token}`).send(body),
  del: (path: string) => base.delete(path).set('Authorization', `Bearer ${token}`),
});
const salaryCited = async (token: string) => {
  const body = (await as(token).post('/api/chat', { message: 'What are the salary bands FY27?' }).expect(200)).body;
  return body.citations.some((c: { doc_id: string }) => c.doc_id === 'salary');
};

test('HR lends access for the day; the employee sees HR documents until it is revoked', async () => {
  const [ravi, asha] = [await login('ravi'), await login('asha')];
  assert.equal(await salaryCited(asha), false);

  const granted = (await as(ravi).post('/api/delegations', { to: 'asha', hours: 8 }).expect(201)).body;
  assert.deepEqual(granted.groups, ['hr']);
  assert.equal(granted.active, true);
  assert.ok(Math.abs(new Date(granted.expires_at).getTime() - Date.now() - 8 * 3_600_000) < 60_000);

  const me = (await as(asha).get('/api/me').expect(200)).body;
  assert.deepEqual(me.delegated_groups, ['hr']);
  assert.deepEqual(me.own_groups, ['employee']);
  assert.equal(await salaryCited(asha), true);

  await as(ravi).del(`/api/delegations/${granted.id}`).expect(200);
  assert.equal(await salaryCited(asha), false);
  assert.deepEqual((await as(asha).get('/api/me').expect(200)).body.delegated_groups, []);
});

test('access ends by itself when the day is over', async () => {
  const [ravi, asha] = [await login('ravi'), await login('asha')];
  const granted = (await as(ravi).post('/api/delegations', { to: 'asha' }).expect(201)).body;
  assert.ok(Math.abs(new Date(granted.expires_at).getTime() - Date.now() - 24 * 3_600_000) < 60_000);
  assert.equal(await salaryCited(asha), true);
  await db.collection('delegations').updateOne({ _id: granted.id }, { $set: { expires_at: new Date(Date.now() - 1000) } });
  assert.equal(await salaryCited(asha), false);
  const listed = (await as(ravi).get('/api/delegations').expect(200)).body;
  assert.equal(listed.given[0].active, false);
});

test('only your own groups can be lent, for at most a day, and never onwards', async () => {
  const [ravi, asha, admin] = [await login('ravi'), await login('asha'), await login('admin')];
  assert.equal((await as(asha).post('/api/delegations', { to: 'meera' }).expect(400)).body.error, 'NOTHING_TO_DELEGATE');
  assert.equal((await as(ravi).post('/api/delegations', { to: 'ravi' }).expect(400)).body.error, 'DELEGATE_TO_SELF');
  assert.equal((await as(ravi).post('/api/delegations', { to: 'nobody' }).expect(404)).body.error, 'DELEGATE_UNKNOWN');
  assert.equal((await as(ravi).post('/api/delegations', { to: 'asha', groups: ['engineering'] }).expect(403)).body.error, 'GROUP_NOT_DELEGABLE');
  assert.equal((await as(ravi).post('/api/delegations', { to: 'asha', groups: ['employee'] }).expect(403)).body.error, 'GROUP_NOT_DELEGABLE');
  await as(ravi).post('/api/delegations', { to: 'asha', hours: 25 }).expect(400);
  await as(ravi).post('/api/delegations', { to: 'asha', hours: 0 }).expect(400);
  assert.equal((await as(admin).post('/api/delegations', { to: 'asha' }).expect(400)).body.error, 'NOTHING_TO_DELEGATE');

  await as(ravi).post('/api/delegations', { to: 'asha' }).expect(201);
  // Asha now holds hr, but only on loan: she cannot pass it to Meera.
  assert.equal((await as(asha).post('/api/delegations', { to: 'meera', groups: ['hr'] }).expect(403)).body.error, 'GROUP_NOT_DELEGABLE');
  assert.equal((await as(asha).post('/api/delegations', { to: 'meera' }).expect(400)).body.error, 'NOTHING_TO_DELEGATE');
});

test('a lender who loses a group stops lending it at once', async () => {
  const [ravi, asha] = [await login('ravi'), await login('asha')];
  await as(ravi).post('/api/delegations', { to: 'asha' }).expect(201);
  assert.equal(await salaryCited(asha), true);
  await db.collection('users').updateOne({ _id: 'ravi' }, { $set: { groups: ['employee'] } });
  assert.equal(await salaryCited(asha), false);
});

test('the lender, the colleague or an admin can end it; nobody else can see or end it', async () => {
  const [ravi, asha, meera, admin] = [await login('ravi'), await login('asha'), await login('meera'), await login('admin')];
  const first = (await as(ravi).post('/api/delegations', { to: 'asha' }).expect(201)).body;
  await as(meera).del(`/api/delegations/${first.id}`).expect(404);
  assert.equal((await as(meera).get('/api/delegations').expect(200)).body.given.length, 0);
  assert.equal((await as(meera).get('/api/delegations').expect(200)).body.active, undefined);
  assert.equal((await as(admin).get('/api/delegations').expect(200)).body.active.length, 1);
  assert.equal((await as(asha).del(`/api/delegations/${first.id}`).expect(200)).body.active, false);

  const second = (await as(ravi).post('/api/delegations', { to: 'asha' }).expect(201)).body;
  assert.equal((await as(admin).del(`/api/delegations/${second.id}`).expect(200)).body.active, false);
  assert.equal(await salaryCited(asha), false);
});

test('a new grant to the same colleague replaces the old one, and three people at a time is the limit', async () => {
  const ravi = await login('ravi');
  const first = (await as(ravi).post('/api/delegations', { to: 'asha', hours: 2 }).expect(201)).body;
  await as(ravi).post('/api/delegations', { to: 'asha', hours: 4 }).expect(201);
  const given = (await as(ravi).get('/api/delegations').expect(200)).body.given;
  assert.equal(given.filter((d: { active: boolean }) => d.active).length, 1);
  assert.equal(given.find((d: { id: string }) => d.id === first.id).active, false);

  await as(ravi).post('/api/delegations', { to: 'meera' }).expect(201);
  await as(ravi).post('/api/delegations', { to: 'ceo' }).expect(201);
  assert.equal((await as(ravi).post('/api/delegations', { to: 'admin' }).expect(409)).body.error, 'DELEGATION_LIMIT');
});

test('delegation is audited as metadata only and stays out of request statistics', async () => {
  const [ravi, admin] = [await login('ravi'), await login('admin')];
  const before = (await as(admin).get('/api/stats').expect(200)).body.requests;
  const since = new Date();
  const granted = (await as(ravi).post('/api/delegations', { to: 'asha' }).expect(201)).body;
  await as(ravi).del(`/api/delegations/${granted.id}`).expect(200);
  const events = await db.collection('audit_events').find({ ts: { $gte: since }, stage: { $in: ['delegation.granted', 'delegation.revoked'] } }).toArray();
  assert.deepEqual(events.map((e: { stage: string }) => e.stage).sort(), ['delegation.granted', 'delegation.revoked']);
  assert.deepEqual(events[0].categories, ['group:hr']);
  for (const id of ['"asha"', '"ravi"', granted.id]) assert.ok(!JSON.stringify(events).includes(id));
  assert.equal((await as(admin).get('/api/stats').expect(200)).body.requests, before);
});
