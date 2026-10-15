import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import handler from '../../api/gateway.js';
const originalFetch = globalThis.fetch, originalGateway = process.env.GATEWAY_URL;
const server = createServer(handler).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const call = (path, init) => originalFetch(base + path, init);
beforeEach(() => { delete process.env.GATEWAY_URL; globalThis.fetch = originalFetch; });
after(async () => {
  globalThis.fetch = originalFetch;
  if (originalGateway === undefined) delete process.env.GATEWAY_URL; else process.env.GATEWAY_URL = originalGateway;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
});
test('unconfigured gateway returns explicit JSON rather than pretending to run a model', async () => {
  const r = await call('/api/gateway?route=/api/health'); assert.equal(r.status, 503); assert.equal((await r.json()).error, 'GATEWAY_NOT_CONFIGURED');
});
test('arbitrary destinations and ambiguous route parameters cannot become a proxy target', async () => {
  for (const route of ['https://attacker.example', '/api/../health', '/api/gateway']) assert.equal((await call('/api/gateway?route=' + encodeURIComponent(route))).status, 400);
  assert.equal((await call('/api/gateway?route=/api/health&route=/api/chat')).status, 400);
});
test('gateway must be a credential-free HTTPS origin', async () => {
  for (const url of ['http://remote.example', 'https://user:password@remote.example', 'https://127.0.0.1', 'https://remote.example/path', 'https://remote.example?secret=value']) {
    process.env.GATEWAY_URL = url; assert.equal((await call('/api/gateway?route=/api/health')).status, 503);
  }
});
test('only selected headers, original JSON body and query reach the configured gateway', async () => {
  process.env.GATEWAY_URL = 'https://gateway.example';
  globalThis.fetch = async (url, opts) => {
    assert.equal(String(url), 'https://gateway.example/api/chat?scope=assigned');
    assert.equal(opts.headers.authorization, 'Bearer synthetic-test-token');
    assert.equal(opts.headers.cookie, undefined); assert.equal(opts.redirect, 'manual');
    assert.deepEqual(JSON.parse(opts.body.toString()), { message: 'Synthetic hello' });
    return Response.json({ action: 'allow' });
  };
  const r = await call('/api/gateway?route=/api/chat&scope=assigned', { method: 'POST', headers: { authorization: 'Bearer synthetic-test-token', cookie: 'private=synthetic', 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Synthetic hello' }) });
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal((await r.json()).action, 'allow');
});
test('SSE bytes and rate-limit status survive the transport', async () => {
  process.env.GATEWAY_URL = 'https://gateway.example';
  globalThis.fetch = async () => new Response('event: audit\ndata: {"category":"INJECTION"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  const r = await call('/api/gateway?route=/api/events'); assert.equal(r.headers.get('content-type'), 'text/event-stream'); assert.match(await r.text(), /event: audit/);
  globalThis.fetch = async () => Response.json({ error: 'RATE_LIMITED' }, { status: 429, headers: { 'retry-after': '10' } });
  const limited = await call('/api/gateway?route=/v1/scan'); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '10');
});
test('upstream failures return a stable error without leaking transport details', async () => {
  process.env.GATEWAY_URL = 'https://gateway.example'; globalThis.fetch = async () => { throw new Error('private transport detail'); };
  const r = await call('/api/gateway?route=/api/health'); assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: 'GATEWAY_UNREACHABLE' });
});
