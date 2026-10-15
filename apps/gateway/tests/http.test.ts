import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Auth, issueToken } from '../src/auth.js';
import { admin, employee, harness, secret } from './helpers.js';

const disposers: (() => void)[] = [];
const setup = () => { const h = harness(); disposers.push(h.close); return h; };
const bearer = async (user = employee) => `Bearer ${await issueToken(user, secret)}`;
afterEach(() => { disposers.splice(0).forEach(fn => fn()); });
describe('authenticated HTTP API', () => {
  it('requires authentication for every data endpoint', async () => {
    const h = setup();
    expect((await request(h.app).post('/chat').send({ prompt: 'hello' })).status).toBe(401);
    expect((await request(h.app).get('/events')).status).toBe(401);
    expect((await request(h.app).get('/policy')).status).toBe(401);
    expect((await request(h.app).get('/health')).status).toBe(200);
  });
  it('rejects impersonation fields, malformed JSON and unexpected message parts', async () => {
    const h = setup(); const token = await bearer();
    const impersonate = await request(h.app).post('/chat').set('Authorization', token).send({ prompt: 'salary', user: 'ravi', groups: ['hr'] });
    expect(impersonate.status).toBe(400);
    const malformed = await request(h.app).post('/chat').set('Authorization', token).set('Content-Type', 'application/json').send('{"secret":"2345 6789 0124"');
    expect(malformed.status).toBe(400); expect(malformed.text).not.toContain('2345');
    const multimodal = await request(h.app).post('/v1/chat/completions').set('Authorization', token).send({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: 'https://evil.test' }] }] });
    expect(multimodal.status).toBe(400); expect(h.provider.complete).not.toHaveBeenCalled();
  });
  it('serves the agreed chat response and metadata without persisting the raw prompt', async () => {
    const h = setup();
    const r = await request(h.app).post('/api/chat').set('Authorization', await bearer()).send({ message: '2345 6789 0124', conversation_id: null });
    expect(r.status).toBe(200); expect(r.body.action).toBe('mask'); expect(r.body.answer).toBe('2345 6789 0124');
    expect(r.body.provider_calls).toBe(1); expect(r.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(h.events)).not.toContain('2345');
  });
  it('implements non-streaming compatible text completions', async () => {
    const h = setup();
    const r = await request(h.app).post('/v1/chat/completions').set('Authorization', await bearer()).send({ model: 'leakshield', messages: [{ role: 'user', content: 'Hello' }] });
    expect(r.status).toBe(200); expect(r.body.object).toBe('chat.completion');
    expect(r.body.choices[0].message.content).toBe('Hello'); expect(r.body.choices[0].finish_reason).toBe('stop');
  });
  it('emits SSE completion chunks only after buffered inspection finishes', async () => {
    const h = setup();
    const r = await request(h.app).post('/v1/chat/completions').set('Authorization', await bearer()).send({ model: 'leakshield', stream: true, messages: [{ role: 'user', content: 'Hello' }] });
    expect(r.status).toBe(200); expect(r.headers['content-type']).toContain('text/event-stream');
    expect(r.text).toContain('chat.completion.chunk'); expect(r.text).toContain('[DONE]');
  });
  it('returns an inspected block message in compatible streaming format without a provider call', async () => {
    const h = setup();
    const r = await request(h.app).post('/v1/chat/completions').set('Authorization', await bearer()).send({ stream: true, messages: [{ role: 'user', content: 'AKIAABCDEFGHIJKLMNOP' }] });
    expect(r.status).toBe(200); expect(r.text).toContain('"provider_calls":0'); expect(r.text).toContain('"action":"block"'); expect(r.text).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(h.provider.complete).not.toHaveBeenCalled();
  });
  it('rejects unsupported SDK parameters and provider model selection', async () => {
    const h = setup(); const token = await bearer();
    for (const extra of [{ model: 'arbitrary-provider-model' }, { temperature: 0.5 }, { tools: [] }]) {
      const r = await request(h.app).post('/v1/chat/completions').set('Authorization', token).send({ messages: [{ role: 'user', content: 'Hello' }], ...extra });
      expect(r.status).toBe(400);
    }
  });
  it('runs advisory preflight without calling the provider', async () => {
    const h = setup();
    const r = await request(h.app).post('/v1/scan').set('Authorization', await bearer()).send({ text: '2345 6789 0124' });
    expect(r.status).toBe(200); expect(r.body.action).toBe('mask'); expect(h.provider.complete).not.toHaveBeenCalled();
  });
  it('keeps administration separate from employee access', async () => {
    const h = setup();
    expect((await request(h.app).get('/policy').set('Authorization', await bearer())).status).toBe(403);
    expect((await request(h.app).get('/policy').set('Authorization', await bearer(admin))).status).toBe(200);
    expect((await request(h.app).get('/events').set('Authorization', await bearer())).status).toBe(403);
  });
  it('denies unapproved browser origins', async () => {
    const h = setup();
    const r = await request(h.app).post('/chat').set('Origin', 'https://evil.test').set('Authorization', await bearer()).send({ prompt: 'Hello' });
    expect(r.status).toBe(403); expect(h.provider.complete).not.toHaveBeenCalled();
  });
  it('rejects expired or wrongly signed JWTs', async () => {
    const auth = new Auth(secret);
    await expect(auth.authenticate(`Bearer ${await issueToken(employee, secret, '-1s')}`)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(auth.authenticate(`Bearer ${await issueToken(employee, 'different-signing-secret-at-least-32')}`)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('maps API keys to server-side identities', async () => {
    const auth = new Auth(secret, [{ key: 'test-api-key-with-32-characters-0000', user: employee }]);
    expect(await auth.authenticate('Bearer test-api-key-with-32-characters-0000')).toEqual(employee);
    await expect(auth.authenticate('Bearer wrong-key')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('rate limits authenticated bursts', async () => {
    const h = setup(); const token = await bearer();
    for (let i = 0; i < 60; i++) await request(h.app).get('/missing').set('Authorization', token);
    const limited = await request(h.app).post('/chat').set('Authorization', token).send({ prompt: 'Hello' });
    expect(limited.status).toBe(429); expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(h.provider.complete).not.toHaveBeenCalled();
  });
  it('explicitly refuses baseline headers rather than publishing misleading protected baseline metrics', async () => {
    const h = setup();
    const r = await request(h.app).post('/api/chat').set('Authorization', await bearer()).set('X-LeakShield-Mode', 'passthrough').send({ message: 'hello', conversation_id: null });
    expect(r.status).toBe(501); expect(h.provider.complete).not.toHaveBeenCalled();
  });
  it('counts completed requests once in admin statistics and includes empty timeline buckets', async () => {
    const h = setup();
    await request(h.app).post('/api/chat').set('Authorization', await bearer()).send({ message: '2345 6789 0124' });
    const r = await request(h.app).get('/api/stats?window=60').set('Authorization', await bearer(admin));
    expect(r.status).toBe(200); expect(r.body.requests).toBe(1); expect(r.body.masked_pct).toBe(100);
    expect(r.body.by_category.AADHAAR).toBe(1); expect(r.body.per_5min.length).toBeGreaterThan(1);
    expect(r.body.per_5min.some((bucket: { incidents: number }) => bucket.incidents === 0)).toBe(true);
  });
  it('keeps statistics admin-only and refuses unbounded windows', async () => {
    const h = setup();
    expect((await request(h.app).get('/api/stats').set('Authorization', await bearer())).status).toBe(403);
    expect((await request(h.app).get('/api/stats?window=999999').set('Authorization', await bearer(admin))).status).toBe(400);
  });
});
