import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Collection, Db } from 'mongodb';
import { z } from 'zod';
import type { Action, Finding, User } from '../../../types.js';
import type { Audit } from './audit.js';
import { GatewayError } from './errors.js';

const identity = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const hierarchySchema = z.object({ managers: z.record(identity, identity), security_reviewers: z.array(identity).min(2).max(20) }).strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value.managers).length > 200 || new Set(value.security_reviewers).size !== value.security_reviewers.length) ctx.addIssue({ code: 'custom', message: 'Invalid hierarchy capacity or reviewers' });
    for (const actor of Object.keys(value.managers)) {
      const visited = new Set([actor]); let next = value.managers[actor];
      while (next) { if (visited.has(next)) { ctx.addIssue({ code: 'custom', message: 'Hierarchy cycle' }); break; } visited.add(next); next = value.managers[next]; }
    }
  });
export type SecurityHierarchy = z.infer<typeof hierarchySchema>;
export function loadSecurityHierarchy(path: string): SecurityHierarchy { return hierarchySchema.parse(JSON.parse(readFileSync(path, 'utf8'))); }
export type RiskKind = 'prompt_manipulation' | 'access_denied' | 'credential_pasting';
const THRESHOLDS: Record<RiskKind, readonly number[]> = { prompt_manipulation: [3, 6, 10], access_denied: [5, 10, 15], credential_pasting: [6, 12, 20] };
export const SECURITY_WINDOW_MS = 15 * 60_000;
interface Signal { _id: string; subject_pseudo: string; kind: RiskKind; at: Date; purge_at: Date; }
interface Alert {
  _id: string; id: string; subject_id: string; subject_pseudo: string; kind: RiskKind; level: number;
  attempts: number; recipients: string[]; created_at: Date; window_start: Date; purge_at: Date;
  delivery: 'pending' | 'delivered'; acknowledged_at: Date | null; acknowledged_by: string | null;
}
export interface SecurityObservation {
  requestId: string; action: Action; providerCalls: number;
  /** Only findings captured BEFORE retrieval/outbound/response; never blame a user for a poisoned document. */
  promptFindings: readonly Pick<Finding, 'category' | 'score' | 'source'>[];
  explicitAccessDenied: boolean;
}

/** A signal requests human review; it does not establish intent or change anybody's access. */
export class SecurityEscalation {
  private readonly signals: Collection<Signal>;
  private readonly alerts: Collection<Alert>;
  private readonly users: Collection<{ _id: string; id: string }>;
  private timer?: ReturnType<typeof setInterval>;
  private flushing?: Promise<void>;
  readonly hierarchy: SecurityHierarchy;
  constructor(db: Db, private readonly audit: Audit, hierarchy: SecurityHierarchy, private readonly now = Date.now) {
    this.hierarchy = hierarchySchema.parse(hierarchy);
    this.signals = db.collection<Signal>('security_signals');
    this.alerts = db.collection<Alert>('security_alerts');
    this.users = db.collection('users');
  }
  async initialise() {
    const ids = new Set([...Object.keys(this.hierarchy.managers), ...Object.values(this.hierarchy.managers), ...this.hierarchy.security_reviewers]);
    for (const id of ids) if (!await this.users.findOne({ _id: id })) throw new GatewayError('SECURITY_HIERARCHY_INVALID');
    await this.signals.createIndex({ subject_pseudo: 1, kind: 1, at: 1 });
    await this.signals.createIndex({ purge_at: 1 }, { expireAfterSeconds: 0 });
    await this.alerts.createIndex({ id: 1 }, { unique: true });
    await this.alerts.createIndex({ recipients: 1, created_at: -1 });
    await this.alerts.createIndex({ purge_at: 1 }, { expireAfterSeconds: 0 });
    await this.flush();
    this.timer = setInterval(() => { void this.flush().catch(() => { /* Pending metadata stays durable for retry. */ }); }, 10_000);
    this.timer.unref();
  }
  close() { if (this.timer) clearInterval(this.timer); }
  private kind(observation: SecurityObservation): RiskKind | undefined {
    if (observation.providerCalls !== 0) return;
    const prompt = observation.promptFindings.filter(f => f.source === 'prompt' || f.source === 'history');
    if (observation.action === 'block' && prompt.some(f => f.category === 'INJECTION' && f.score >= 0.85)) return 'prompt_manipulation';
    if (observation.action === 'deny' && observation.explicitAccessDenied) return 'access_denied';
    if (observation.action === 'block' && prompt.some(f => ['SECRET', 'CREDENTIAL', 'PRIVATE_KEY'].includes(f.category))) return 'credential_pasting';
  }
  private async recipients(subject: string, level: number): Promise<string[]> {
    const chain: string[] = []; const seen = new Set([subject]); let next = this.hierarchy.managers[subject];
    while (next && !seen.has(next)) { chain.push(next); seen.add(next); next = this.hierarchy.managers[next]; }
    const targets = level === 3 ? [...chain.slice(0, 2), ...this.hierarchy.security_reviewers] : chain.slice(0, level);
    const existing = await this.users.find({ _id: { $in: [...new Set([...targets, ...this.hierarchy.security_reviewers])] } }).toArray();
    const available = new Set(existing.map(u => u._id));
    const primary = targets.filter(id => id !== subject && available.has(id));
    const independent = [...new Set((primary.length ? primary : this.hierarchy.security_reviewers.filter(id => available.has(id))).filter(id => id !== subject))];
    if (!independent.length) throw new GatewayError('SECURITY_ROUTING_UNAVAILABLE');
    return independent;
  }
  async observe(user: User, observation: SecurityObservation): Promise<void> {
    const kind = this.kind(observation); if (!kind) return;
    const now = this.now(), cutoff = new Date(now - SECURITY_WINDOW_MS), pseudo = this.audit.pseudo(user);
    try { await this.signals.insertOne({ _id: observation.requestId, subject_pseudo: pseudo, kind, at: new Date(now), purge_at: new Date(now + 60 * 60_000) }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw new GatewayError('SECURITY_MONITOR_UNAVAILABLE'); }
    const attempts = await this.signals.countDocuments({ subject_pseudo: pseudo, kind, at: { $gt: cutoff, $lte: new Date(now) } });
    for (const [index, threshold] of THRESHOLDS[kind].entries()) {
      if (attempts < threshold) continue;
      const level = index + 1;
      try {
        // _id makes the cooldown claim atomic even across concurrent requests/processes.
        await this.alerts.findOneAndUpdate({ _id: `${pseudo}:${kind}:${level}`, created_at: { $lte: cutoff }, delivery: 'delivered' }, {
          $set: { id: randomUUID(), subject_id: user.id, subject_pseudo: pseudo, kind, level, attempts,
            recipients: await this.recipients(user.id, level), created_at: new Date(now), window_start: cutoff,
            purge_at: new Date(now + 30 * 24 * 60 * 60_000), delivery: 'pending', acknowledged_at: null, acknowledged_by: null },
        }, { upsert: true });
      } catch (error) { if ((error as { code?: number }).code !== 11000) throw new GatewayError('SECURITY_MONITOR_UNAVAILABLE'); }
    }
    await this.flush();
  }
  /** Durable outbox: an alert is visible only after its metadata audit event persists. */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      for await (const alert of this.alerts.find({ delivery: 'pending' }).limit(1000)) {
        await this.audit.write({ request_id: alert.id, ts: alert.created_at, user_pseudo: alert.subject_pseudo,
          conversation_pseudo: this.audit.fingerprint('conversation', `security-alert:${alert.id}`), stage: 'security.alert',
          categories: ['SECURITY_ESCALATION'], counts: { level: alert.level, attempts: alert.attempts },
          rule_ids: [`escalation.${alert.kind}`], policy_version: 'security-escalation-v1', action: 'warn',
          model_called: false, via: [], stage_ms: {}, total_ms: 0 });
        await this.alerts.updateOne({ _id: alert._id, id: alert.id, delivery: 'pending' }, { $set: { delivery: 'delivered' } });
      }
    })();
    try { await this.flushing; } finally { this.flushing = undefined; }
  }
  async list(user: User, scope: 'assigned' | 'oversight' = 'assigned') {
    const reviewer = this.hierarchy.security_reviewers.includes(user.id);
    if (scope === 'oversight' && !reviewer) throw new GatewayError('FORBIDDEN', 403);
    await this.flush();
    const rows = await this.alerts.find({ subject_id: { $ne: user.id }, delivery: 'delivered', purge_at: { $gt: new Date(this.now()) },
      ...(scope === 'assigned' ? { recipients: user.id } : {}) }).sort({ created_at: -1 }).limit(101).toArray();
    return { enabled: true, can_review_all: reviewer, scope, truncated: rows.length > 100,
      alerts: rows.slice(0, 100).map(row => ({ id: row.id, subject_id: row.subject_id, kind: row.kind, level: row.level, attempts: row.attempts,
        created_at: row.created_at.toISOString(), window_start: row.window_start.toISOString(), window_end: row.created_at.toISOString(),
        acknowledged_at: row.acknowledged_at?.toISOString() ?? null })) };
  }
  async acknowledge(user: User, id: string) {
    const query = { id, subject_id: { $ne: user.id }, delivery: 'delivered' as const, purge_at: { $gt: new Date(this.now()) },
      ...(this.hierarchy.security_reviewers.includes(user.id) ? {} : { recipients: user.id }) };
    const row = await this.alerts.findOneAndUpdate({ ...query, acknowledged_at: null }, {
      $set: { acknowledged_at: new Date(this.now()), acknowledged_by: user.id },
    }, { returnDocument: 'after' });
    if (row) return { id, acknowledged_at: row.acknowledged_at!.toISOString() };
    const previous = await this.alerts.findOne(query);
    if (!previous) throw new GatewayError('ALERT_NOT_FOUND', 404);
    return { id, acknowledged_at: previous.acknowledged_at!.toISOString() };
  }
}
