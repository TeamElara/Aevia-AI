import { z } from 'zod';
import type { Message, Provider, ProviderResult } from '../../../types.js';
import { GatewayError } from './errors.js';

const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().max(100_000) }), finish_reason: z.string().nullable().optional() })).min(1),
});
interface Options {
  kind: 'groq' | 'ollama';
  baseURL: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
}
export class HttpProvider implements Provider {
  readonly external: boolean;
  readonly model: string;
  private readonly request: typeof fetch;
  private readonly url: string;
  constructor(private readonly options: Options) {
    const base = new URL(options.baseURL);
    if (base.username || base.password || base.search || base.hash) throw new GatewayError('PROVIDER_CONFIG_INVALID');
    if (options.kind === 'groq' && (base.protocol !== 'https:' || base.hostname !== 'api.groq.com')) throw new GatewayError('PROVIDER_CONFIG_INVALID');
    // Local fallback must really be local. Never silently reroute deny-external documents to a cloud URL.
    if (options.kind === 'ollama' && !['localhost', '127.0.0.1', '[::1]', 'host.docker.internal', 'ollama'].includes(base.hostname)) throw new GatewayError('PROVIDER_CONFIG_INVALID');
    if (!['http:', 'https:'].includes(base.protocol) || !options.model || (options.kind === 'groq' && !options.apiKey)) throw new GatewayError('PROVIDER_CONFIG_INVALID');
    this.url = `${base.href.replace(/\/$/, '')}/chat/completions`;
    this.external = options.kind === 'groq';
    this.model = options.model;
    this.request = options.fetch ?? fetch;
  }
  async complete(messages: readonly Message[], onAttempt: () => void): Promise<ProviderResult> {
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    const retries = Math.min(this.options.maxRetries ?? 2, 3);
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        signal.throwIfAborted();
        onAttempt();
        const response = await this.request(this.url, {
          method: 'POST', signal, redirect: 'error',
          headers: { 'content-type': 'application/json', ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}) },
          body: JSON.stringify({ model: this.model, messages, stream: false, max_tokens: 1024 }),
        });
        if (response.status === 429 && attempt < retries) {
          await response.body?.cancel();
          const after = response.headers.get('retry-after');
          const numeric = after === null ? NaN : Number(after);
          const requested = Number.isFinite(numeric) ? numeric * 1000 : after ? Date.parse(after) - Date.now() : NaN;
          const delay = Math.min(Math.max(Number.isFinite(requested) ? requested : 250 * 2 ** attempt, 0), 2000);
          await new Promise<void>((resolve, reject) => {
            const done = () => { signal.removeEventListener('abort', aborted); resolve(); };
            const timer = setTimeout(done, delay);
            const aborted = () => { clearTimeout(timer); reject(new Error('aborted')); };
            signal.addEventListener('abort', aborted, { once: true });
            if (signal.aborted) aborted();
          });
          continue;
        }
        if (!response.ok) { await response.body?.cancel(); throw new GatewayError('PROVIDER_UNAVAILABLE', 502); }
        const reader = response.body?.getReader();
        if (!reader) throw new GatewayError('PROVIDER_INVALID_RESPONSE', 502);
        const buffers: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 1_000_000) throw new GatewayError('PROVIDER_INVALID_RESPONSE', 502);
            buffers.push(value);
          }
        } finally { await reader.cancel(); }
        const data = responseSchema.parse(JSON.parse(Buffer.concat(buffers).toString('utf8')));
        const choice = data.choices[0]!;
        if (choice.finish_reason && !['stop', 'length'].includes(choice.finish_reason)) throw new GatewayError('PROVIDER_INVALID_RESPONSE', 502);
        return { content: choice.message.content, model: this.model };
      }
      throw new GatewayError('PROVIDER_UNAVAILABLE', 502);
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', 502);
    }
  }
}
