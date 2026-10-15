import { describe, expect, it, vi } from 'vitest';
import { HttpProvider } from '../src/provider.js';

const options = { kind: 'groq' as const, baseURL: 'https://api.groq.com/openai/v1', apiKey: 'fake-key', model: 'test-model' };
const messages = [{ role: 'user' as const, content: 'sanitised prompt' }];
const success = () => Response.json({ choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }] });
describe('provider adapter', () => {
  it('captures actual HTTP attempts and always requests buffered output', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(success());
    const p = new HttpProvider({ ...options, fetch: mock }); const count = vi.fn();
    expect(await p.complete(messages, count)).toEqual({ content: 'Hello', model: 'test-model' });
    expect(count).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(JSON.parse(mock.mock.calls[0]![1]!.body as string)).toMatchObject({ stream: false, model: 'test-model', messages });
  });
  it('retries HTTP 429 with a bounded count', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } })).mockResolvedValueOnce(success());
    const p = new HttpProvider({ ...options, fetch: mock }); const count = vi.fn();
    await p.complete(messages, count); expect(count).toHaveBeenCalledTimes(2);
  });
  it('stops after the configured retries', async () => {
    const mock = vi.fn<typeof fetch>().mockImplementation(async () => new Response('sensitive error', { status: 429, headers: { 'retry-after': '0' } }));
    const p = new HttpProvider({ ...options, fetch: mock, maxRetries: 1 }); const count = vi.fn();
    await expect(p.complete(messages, count)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(count).toHaveBeenCalledTimes(2);
  });
  it('never exposes raw provider errors', async () => {
    const p = new HttpProvider({ ...options, fetch: vi.fn().mockResolvedValue(new Response('2345 6789 0124', { status: 500 })) });
    await expect(p.complete(messages, () => {})).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', message: 'PROVIDER_UNAVAILABLE' });
  });
  it('rejects malformed or oversized provider output', async () => {
    for (const response of [Response.json({ choices: [] }), new Response('x'.repeat(1_000_001))]) {
      const p = new HttpProvider({ ...options, fetch: vi.fn().mockResolvedValue(response) });
      await expect(p.complete(messages, () => {})).rejects.toBeDefined();
    }
  });
  it('uses one timeout for the complete retry budget', async () => {
    const mock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true });
    }));
    const p = new HttpProvider({ ...options, fetch: mock, timeoutMs: 5 });
    await expect(p.complete(messages, () => {})).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  });
  it('does not follow provider redirects', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(success());
    await new HttpProvider({ ...options, fetch: mock }).complete(messages, () => {});
    expect(mock.mock.calls[0]![1]!.redirect).toBe('error');
  });
  it('refuses a cloud address pretending to be a local fallback', () => {
    expect(() => new HttpProvider({ kind: 'ollama', baseURL: 'https://evil.test/v1', model: 'local' })).toThrow('PROVIDER_CONFIG_INVALID');
    expect(() => new HttpProvider({ ...options, baseURL: 'https://api.groq.com.evil.test/v1' })).toThrow('PROVIDER_CONFIG_INVALID');
  });
  it('supports the local Ollama completion shape', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValueOnce(success());
    const p = new HttpProvider({ kind: 'ollama', baseURL: 'http://127.0.0.1:11434/v1', model: 'local', fetch: mock });
    expect(p.external).toBe(false); expect((await p.complete(messages, () => {})).content).toBe('Hello');
  });
});
