import { randomBytes, randomUUID } from 'node:crypto';
import type { Finding, Message } from '../../../types.js';
import { GatewayError } from './errors.js';

interface Entry { value: string; category: string; }
interface Conversation {
  owner: string;
  expires: number;
  entries: Map<string, Entry>;
  history: Message[];
  busy: boolean;
}
export interface Span { start: number; end: number; category: string; }
export function mergeSpans(findings: readonly Pick<Finding, 'start' | 'end' | 'category'>[]): Span[] {
  const spans: Span[] = [];
  for (const f of [...findings].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const previous = spans.at(-1);
    if (previous && f.start < previous.end) previous.end = Math.max(previous.end, f.end);
    else spans.push({ start: f.start, end: f.end, category: f.category });
  }
  return spans;
}
export function redact(text: string, findings: readonly Finding[]): string {
  for (const span of mergeSpans(findings).reverse()) text = text.slice(0, span.start) + '[REDACTED]' + text.slice(span.end);
  return text;
}
/** Single-process, memory-only. No raw values or transcripts are persisted. */
export class ConversationVault {
  private conversations = new Map<string, Conversation>();
  private readonly sweeper: ReturnType<typeof setInterval>;
  constructor(private readonly ttlMs = 30 * 60_000, private readonly now = Date.now, private readonly maxConversations = 1000) {
    this.sweeper = setInterval(() => this.prune(), Math.min(ttlMs, 60_000));
    this.sweeper.unref();
  }
  private prune(): void {
    for (const [id, c] of this.conversations) if (c.expires <= this.now()) this.conversations.delete(id);
  }
  private get(id: string, owner: string): Conversation {
    this.prune();
    const c = this.conversations.get(id);
    if (!c || c.owner !== owner) throw new GatewayError('CONVERSATION_NOT_FOUND', 404);
    return c;
  }
  acquire(owner: string, requestedId?: string): { id: string; release: () => void } {
    this.prune();
    let id = requestedId;
    if (!id) {
      if (this.conversations.size >= this.maxConversations) throw new GatewayError('VAULT_CAPACITY', 503);
      id = randomUUID();
      this.conversations.set(id, { owner, expires: this.now() + this.ttlMs, entries: new Map(), history: [], busy: false });
    }
    const c = this.get(id, owner);
    if (c.busy) throw new GatewayError('CONVERSATION_BUSY', 409);
    c.busy = true;
    return { id, release: () => { c.busy = false; } };
  }
  mask(id: string, owner: string, text: string, findings: readonly Finding[]): string {
    const c = this.get(id, owner);
    for (const span of mergeSpans(findings).reverse()) {
      const value = text.slice(span.start, span.end);
      let token = [...c.entries].find(([, e]) => e.value === value && e.category === span.category)?.[0];
      if (!token) {
        if (c.entries.size >= 500 || [...c.entries.values()].reduce((n, e) => n + e.value.length, 0) + value.length > 128_000) throw new GatewayError('VAULT_CAPACITY');
        do { token = `[${span.category}_${randomBytes(16).toString('hex')}]`; } while (text.includes(token) || c.entries.has(token));
        c.entries.set(token, { value, category: span.category });
      }
      text = text.slice(0, span.start) + token + text.slice(span.end);
    }
    return text;
  }
  restore(id: string, owner: string, text: string): string {
    const c = this.get(id, owner);
    // One replacement pass: values containing token-like text cannot trigger recursive restoration.
    return text.replace(/\[[A-Z][A-Z0-9_]{0,39}_[a-f0-9]{32}\]/g, token => c.entries.get(token)?.value ?? token);
  }
  history(id: string, owner: string): Message[] { return structuredClone(this.get(id, owner).history); }
  tokens(id: string, owner: string): string[] { return [...this.get(id, owner).entries.keys()]; }
  append(id: string, owner: string, messages: Message[]): void {
    const c = this.get(id, owner);
    c.history.push(...structuredClone(messages));
    while (c.history.length > 12 || c.history.reduce((n, m) => n + m.content.length, 0) > 60_000) c.history.splice(0, 2);
  }
  close(): void { clearInterval(this.sweeper); this.conversations.clear(); }
}
