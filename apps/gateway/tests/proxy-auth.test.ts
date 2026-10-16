import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { proxyAuth } from '../src/proxy-auth.js';
const secret = 'synthetic-proxy-secret-for-local-tests-only';
const app = (key?: string) => {
  const instance = express(); instance.use(proxyAuth(key));
  instance.use((_req, res) => res.json({ reached: true })); return instance;
};
describe('cloud origin authorization', () => {
  it('keeps existing local setups unchanged when no proxy credential is configured', async () => {
    await request(app()).post('/api/auth/login').expect(200);
  });
  it('denies direct login, APIs and preflight requests without the server credential', async () => {
    for (const path of ['/api/auth/login', '/api/chat', '/api/delegations', '/api/security/alerts', '/v1/chat/completions']) {
      const result = await request(app(secret)).post(path).expect(401);
      expect(result.body).toEqual({ error: 'PROXY_AUTH_REQUIRED' });
    }
    await request(app(secret)).options('/api/auth/login').expect(401);
  });
  it('rejects incorrect, repeated and differing-length credentials', async () => {
    for (const candidate of ['incorrect', secret + 'x', 'x'.repeat(secret.length), secret + ', ' + secret]) await request(app(secret)).get('/api/health').set('x-leakshield-proxy-secret', candidate).expect(401);
  });
  it('passes legitimate proxy requests through without replacing per-user authentication', async () => {
    await request(app(secret)).post('/api/auth/login').set('x-leakshield-proxy-secret', secret).expect(200);
  });
  it('allows only exact GET liveness/readiness probes without a credential', async () => {
    for (const path of ['/health', '/ready']) {
      await request(app(secret)).get(path).expect(200);
      await request(app(secret)).post(path).expect(401);
    }
    await request(app(secret)).get('/api/health').expect(401);
  });
});
