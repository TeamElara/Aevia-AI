import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { Auth, issueToken } from '../src/auth.js';
import { OfflineBaseline } from '../src/baseline.js';
import { employee, harness, secret } from './helpers.js';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(fn => fn()));
describe('explicit offline comparison mode', () => {
  const setup = () => {
    const h = harness({ evalMode: true }); cleanup.push(h.close);
    const baseline = new OfflineBaseline(h.provider, h.audit, async () => ['Synthetic restricted reference']); cleanup.push(() => baseline.close());
    return { h, baseline };
  };
  it('requires both an explicit eval process and a baseline adapter before honoring the header', async () => {
    const { h, baseline } = setup();
    const app = createApp({ ...h, baseline, evalMode: false, auth: new Auth(secret), ready: () => true });
    const r = await request(app).post('/api/chat').set('Authorization', `Bearer ${await issueToken(employee, secret)}`).set('X-LeakShield-Mode', 'passthrough').send({ message: 'hello' });
    expect(r.status).toBe(501); expect(h.provider.complete).not.toHaveBeenCalled();
  });
  it('captures intentionally unprotected payloads only for the opt-in evaluator', async () => {
    const { h, baseline } = setup();
    const app = createApp({ ...h, baseline, evalMode: true, auth: new Auth(secret), ready: () => true });
    const r = await request(app).post('/api/chat').set('Authorization', `Bearer ${await issueToken(employee, secret)}`).set('X-LeakShield-Mode', 'passthrough').set('X-Eval-Capture', '1').send({ message: '2345 6789 0124' });
    expect(r.status).toBe(200); expect(r.body.policy_version).toBe('offline-baseline'); expect(r.body.eval.provider_payload).toContain('2345 6789 0124');
    expect(r.body.eval.provider_payload).toContain('Synthetic restricted reference'); expect(r.body.provider_calls).toBe(1); expect(r.body.stage_ms).toHaveProperty('LLM');
    expect(JSON.stringify(h.events)).not.toContain('2345'); expect(JSON.stringify(h.events)).not.toContain('Synthetic restricted reference');
  });
  it('keeps unprotected multi-turn history encrypted at rest in memory and isolated by owner', async () => {
    const { baseline } = setup(); const first = await baseline.run(employee, '2345 6789 0124');
    const second = await baseline.run(employee, 'continue', first.conversation_id);
    expect(JSON.stringify(second.captured_payload)).toContain('2345 6789 0124');
    await expect(baseline.run({ id: 'ravi', groups: ['hr'] }, 'continue', first.conversation_id)).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
  });
  it('does not expose full payloads to the console without the capture header', async () => {
    const { h } = setup(); const app = createApp({ ...h, evalMode: true, auth: new Auth(secret), ready: () => true });
    const r = await request(app).post('/api/chat').set('Authorization', `Bearer ${await issueToken(employee, secret)}`).send({ message: 'hello' });
    expect(r.body).not.toHaveProperty('eval'); expect(r.body).not.toHaveProperty('captured_payload');
  });
});
