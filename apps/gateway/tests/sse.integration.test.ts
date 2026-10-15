import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import type { AuditEvent } from '../../../types.js';
import { Audit } from '../src/audit.js';
import { createApp } from '../src/app.js';
import { Auth, issueToken } from '../src/auth.js';
import { admin, harness, secret } from './helpers.js';

it('drains a large audit snapshot, delivers live events and stays healthy after client disconnect', async () => {
  const h = harness();
  const event = (): AuditEvent => ({ request_id: randomUUID(), ts: new Date(), user_pseudo: 'a'.repeat(64), conversation_pseudo: 'b'.repeat(64),
    stage: 'complete', categories: ['INJECTION'], counts: { INJECTION: 100 }, rule_ids: Array.from({ length: 100 }, (_, i) => `rule.${i}.${'x'.repeat(60)}`),
    policy_version: '1', action: 'block', model_called: false, via: ['raw'], stage_ms: {}, total_ms: 1 });
  const snapshot = Array.from({ length: 50 }, event);
  const audit = new Audit({ insert: async () => {}, recent: async () => structuredClone(snapshot) }, secret);
  const app = createApp({ ...h, audit, auth: new Auth(secret), ready: () => true });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(base + '/api/events', { headers: { Authorization: `Bearer ${await issueToken(admin, secret)}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
    reader = response.body!.getReader(); let received = '';
    while ((received.match(/event: audit/g) ?? []).length < 50) {
      const chunk = await reader.read(); expect(chunk.done).toBe(false); received += new TextDecoder().decode(chunk.value);
    }
    const live = event(); await audit.write(live);
    while (!received.includes(live.request_id)) {
      const chunk = await reader.read(); expect(chunk.done).toBe(false); received += new TextDecoder().decode(chunk.value);
    }
    controller.abort(); await reader.cancel().catch(() => {});
    expect((await fetch(base + '/health')).status).toBe(200);
    expect(audit.events.listenerCount('audit')).toBe(0);
  } finally {
    controller.abort(); await reader?.cancel().catch(() => {}); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); h.close();
  }
});
