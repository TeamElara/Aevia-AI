import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Collection, Db } from 'mongodb';
import { z } from 'zod';
import type { AuditEvent, User } from '../../../types.js';
import { GatewayError } from './errors.js';

const label = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/);
const eventSchema = z.object({
  request_id: z.uuid(), ts: z.date(), user_pseudo: z.string().regex(/^[a-f0-9]{64}$/),
  conversation_pseudo: z.string().regex(/^[a-f0-9]{64}$/),
  stage: label, categories: z.array(label).max(100), counts: z.record(label, z.number().int().min(0)),
  rule_ids: z.array(label).max(100), policy_version: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
  action: z.enum(['allow', 'warn', 'mask', 'redact', 'quarantine', 'deny', 'require_approval', 'block']),
  model_called: z.boolean(), via: z.array(z.enum(['raw', 'normalised', 'decoded'])),
  stage_ms: z.record(label, z.number().finite().min(0)), total_ms: z.number().finite().min(0),
});
export interface AuditStore { insert(event: AuditEvent): Promise<void>; recent?(limit: number): Promise<AuditEvent[]>; window?(since: Date): Promise<AuditEvent[]>; }
export class MongoAuditStore implements AuditStore {
  private readonly collection: Collection<AuditEvent>;
  constructor(db: Db) { this.collection = db.collection<AuditEvent>('audit_events'); }
  async initialise(): Promise<void> {
    await this.collection.createIndex({ ts: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
    await this.collection.createIndex({ request_id: 1, ts: 1 });
  }
  async insert(event: AuditEvent): Promise<void> { await this.collection.insertOne(structuredClone(event)); }
  async recent(limit: number): Promise<AuditEvent[]> { return (await this.collection.find().sort({ ts: -1 }).limit(limit).toArray()).map(row => eventSchema.parse(row)); }
  async window(since: Date): Promise<AuditEvent[]> {
    const rows = await this.collection.find({ ts: { $gte: since }, stage: { $in: ['complete', 'failed', 'baseline.complete'] } }).sort({ ts: 1 }).limit(10001).toArray();
    if (rows.length > 10000) throw new GatewayError('STATS_CAPACITY');
    return rows.map(row => eventSchema.parse(row));
  }
}
export class Audit {
  readonly events = new EventEmitter();
  private readonly ring: AuditEvent[] = [];
  constructor(private readonly store: AuditStore, private readonly secret: string) { this.events.setMaxListeners(100); }
  pseudo(user: User): string { return this.fingerprint('user', user.id); }
  fingerprint(domain: 'user' | 'value' | 'approval' | 'conversation', value: string): string {
    return createHmac('sha256', this.secret).update(`${domain}\0${value}`).digest('hex');
  }
  async write(event: AuditEvent): Promise<void> {
    try {
      // Unknown fields are stripped at the last persistence boundary, including matched text.
      const safe = eventSchema.parse(event);
      await this.store.insert(safe);
      this.ring.push(structuredClone(safe)); if (this.ring.length > 50) this.ring.shift();
      this.events.emit('audit', structuredClone(safe));
    } catch { throw new GatewayError('AUDIT_UNAVAILABLE'); }
  }
  async recent(): Promise<AuditEvent[]> { return this.store.recent ? await this.store.recent(50) : structuredClone([...this.ring].reverse()); }
  async stats(minutes: number, version: string, now = Date.now()) {
    const since = new Date(now - minutes * 60_000);
    const rows = this.store.window ? await this.store.window(since) : this.ring.filter(e => e.ts >= since && ['complete', 'failed', 'baseline.complete'].includes(e.stage));
    const by_category: Record<string, number> = {}; const by_action: Record<string, number> = {};
    const first = Math.floor(since.getTime() / 300_000) * 300_000;
    const buckets = new Map<number, number>();
    for (let t = first; t <= now; t += 300_000) buckets.set(t, 0);
    const overhead: number[] = [];
    for (const row of rows) {
      const action = row.action === 'block' && row.model_called ? 'block_response' : row.action;
      by_action[action] = (by_action[action] ?? 0) + 1;
      for (const category of row.categories) by_category[category] = (by_category[category] ?? 0) + 1;
      if (action !== 'allow') { const t = Math.floor(row.ts.getTime() / 300_000) * 300_000; if (buckets.has(t)) buckets.set(t, buckets.get(t)! + 1); }
      overhead.push(Math.max(0, row.total_ms - (row.stage_ms.llm ?? row.stage_ms.LLM ?? 0)));
    }
    overhead.sort((a, b) => a - b);
    const pct = (p: number) => overhead.length ? overhead[Math.max(0, Math.ceil(overhead.length * p) - 1)]! : null;
    const percentage = (n: number) => rows.length ? Math.round(n / rows.length * 1000) / 10 : 0;
    return { window_minutes: minutes, requests: rows.length, blocked_pct: percentage((by_action.block ?? 0) + (by_action.block_response ?? 0) + (by_action.deny ?? 0)),
      masked_pct: percentage(by_action.mask ?? 0), by_category, by_action, per_5min: [...buckets].map(([t, incidents]) => ({ t: new Date(t).toISOString(), incidents })),
      overhead_ms_p50: pct(0.5), overhead_ms_p95: pct(0.95), policy_version: version };
  }
}
