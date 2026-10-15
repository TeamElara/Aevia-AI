import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Collection, Db } from 'mongodb';
import { z } from 'zod';
import type { AuditEvent, User } from '../../../types.js';
import { GatewayError } from './errors.js';

const label = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/);
const eventSchema = z.object({
  request_id: z.uuid(), ts: z.date(), user_pseudo: z.string().regex(/^[a-f0-9]{64}$/),
  stage: label, categories: z.array(label).max(100), counts: z.record(label, z.number().int().min(0)),
  rule_ids: z.array(label).max(100), policy_version: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
  action: z.enum(['allow', 'warn', 'mask', 'redact', 'quarantine', 'deny', 'require_approval', 'block']),
  model_called: z.boolean(), via: z.array(z.enum(['raw', 'normalised', 'decoded'])),
  stage_ms: z.record(label, z.number().finite().min(0)), total_ms: z.number().finite().min(0),
});
export interface AuditStore { insert(event: AuditEvent): Promise<void>; }
export class MongoAuditStore implements AuditStore {
  private readonly collection: Collection<AuditEvent>;
  constructor(db: Db) { this.collection = db.collection<AuditEvent>('audit_events'); }
  async initialise(): Promise<void> {
    await this.collection.createIndex({ ts: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
    await this.collection.createIndex({ request_id: 1, ts: 1 });
  }
  async insert(event: AuditEvent): Promise<void> { await this.collection.insertOne(structuredClone(event)); }
}
export class Audit {
  readonly events = new EventEmitter();
  constructor(private readonly store: AuditStore, private readonly secret: string) { this.events.setMaxListeners(100); }
  pseudo(user: User): string { return this.fingerprint('user', user.id); }
  fingerprint(domain: 'user' | 'value' | 'approval', value: string): string {
    return createHmac('sha256', this.secret).update(`${domain}\0${value}`).digest('hex');
  }
  async write(event: AuditEvent): Promise<void> {
    try {
      // Unknown fields are stripped at the last persistence boundary, including matched text.
      const safe = eventSchema.parse(event);
      await this.store.insert(safe);
      this.events.emit('audit', structuredClone(safe));
    } catch { throw new GatewayError('AUDIT_UNAVAILABLE'); }
  }
}
