import { once } from 'node:events';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import OpenAI from 'openai';
import type { AuditEvent } from '../../../types.js';
import { createApp } from '../src/app.js';
import { Audit, MongoAuditStore } from '../src/audit.js';
import { Auth, issueToken } from '../src/auth.js';
import { Gateway } from '../src/pipeline.js';
import { HttpProvider } from '../src/provider.js';
import { admin, employee, harness, secret } from './helpers.js';

describe('real MongoDB + HTTP + stock SDK integration (simulated LLM)', () => {
  let mongo: MongoMemoryServer;
  let dbClient: MongoClient;
  let audit: Audit;
  let server: Server;
  let baseURL: string;
  let h: ReturnType<typeof harness>;
  let sdk: OpenAI;
  let upstream: Server;
  let upstreamCalls = 0;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.0.16' } });
    dbClient = new MongoClient(mongo.getUri()); await dbClient.connect();
    const store = new MongoAuditStore(dbClient.db('integration')); await store.initialise();
    audit = new Audit(store, 'integration-only-audit-secret-32-characters');
    h = harness();
    upstream = createServer(async (req, res) => {
      upstreamCalls++;
      const parts: Buffer[] = []; for await (const part of req) parts.push(Buffer.from(part));
      const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: body.messages.at(-1).content }, finish_reason: 'stop' }] }));
    }).listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('missing upstream');
    const provider = new HttpProvider({ kind: 'ollama', baseURL: `http://127.0.0.1:${upstreamAddress.port}/v1`, model: 'fixture' });
    const gateway = new Gateway({ ...h, audit, provider });
    const app = createApp({ gateway, audit, auth: new Auth(secret), policies: h.policies, ready: () => true });
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    baseURL = `http://127.0.0.1:${address.port}`;
    sdk = new OpenAI({ baseURL: `${baseURL}/v1`, apiKey: await issueToken(employee, secret), maxRetries: 0 });
  });
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    if (upstream) { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
    h?.close(); await dbClient?.close(); await mongo?.stop();
  });
  it('works with the unmodified stock SDK for non-streaming chat', async () => {
    const result = await sdk.chat.completions.create({ model: 'leakshield', messages: [{ role: 'user', content: 'Write a letter for 2345 6789 0124' }] });
    expect(result.choices[0]?.message.content).toContain('2345 6789 0124');
  });
  it('works with the stock SDK streaming iterator after inspection', async () => {
    const stream = await sdk.chat.completions.create({ model: 'leakshield', stream: true, messages: [{ role: 'user', content: 'Hello SDK' }] });
    let text = '';
    for await (const chunk of stream) text += chunk.choices[0]?.delta.content ?? '';
    expect(text).toBe('Hello SDK');
  });
  it('rejects blocked prompts through the SDK without making an additional provider call', async () => {
    const callsBefore = upstreamCalls;
    await expect(sdk.chat.completions.create({ model: 'leakshield', messages: [{ role: 'user', content: 'AKIAABCDEFGHIJKLMNOP' }] })).rejects.toMatchObject({ status: 403 });
    expect(upstreamCalls).toBe(callsBefore);
  });
  it('persists metadata-only audit records with HMAC identity and a 30-day TTL index', async () => {
    const collection = dbClient.db('integration').collection('audit_events');
    const docs = await collection.find().toArray();
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every(d => d.ts instanceof Date && d.user_pseudo !== employee.id && /^[a-f0-9]{64}$/.test(d.user_pseudo))).toBe(true);
    for (const value of ['2345 6789 0124', 'AKIAABCDEFGHIJKLMNOP', 'Hello SDK']) expect(JSON.stringify(docs)).not.toContain(value);
    const indexes = await collection.indexes();
    expect(indexes.find(i => i.key.ts === 1 && Object.keys(i.key).length === 1)?.expireAfterSeconds).toBe(2592000);
  });
  it('strips unexpected raw payload properties at the Mongo persistence boundary', async () => {
    const event: AuditEvent = {
      request_id: 'd67c0030-d113-4f89-b48e-e5d1aa3f242e', ts: new Date(), user_pseudo: audit.pseudo(employee), stage: 'test',
      categories: [], counts: {}, rule_ids: [], policy_version: '1', action: 'allow', model_called: false, via: [], stage_ms: {}, total_ms: 1,
    };
    await audit.write({ ...event, prompt: '2345 6789 0124', response: 'ABCDE1234F' } as AuditEvent);
    const doc = await dbClient.db('integration').collection('audit_events').findOne({ request_id: event.request_id });
    expect(doc).not.toHaveProperty('prompt'); expect(doc).not.toHaveProperty('response');
  });
  it('delivers authenticated live audit events over SSE', async () => {
    const token = await issueToken(admin, secret);
    const controller = new AbortController();
    const response = await fetch(`${baseURL}/events`, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    try {
      await reader.read(); // connection prelude
      await sdk.chat.completions.create({ model: 'leakshield', messages: [{ role: 'user', content: 'SSE test' }] });
      const chunk = await reader.read(); const text = new TextDecoder().decode(chunk.value);
      expect(text).toContain('event: audit'); expect(text).toContain('user_pseudo'); expect(text).not.toContain('SSE test');
    } finally { controller.abort(); await reader.cancel().catch(() => {}); }
  });
});
