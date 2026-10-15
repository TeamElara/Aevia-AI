import { randomUUID } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { z } from 'zod';
import type { User } from '../../../types.js';
import type { Audit } from './audit.js';
import { GatewayError } from './errors.js';

// Acting posts: someone going on leave assigns their post (their own groups, such as hr) to a
// colleague for a limited time, starting now or later, for example "cover HR for me from
// Monday 9:00 for two days". Lent groups are added when the colleague's identity is resolved
// on each request, so the start, the end and any early revocation take effect on the very
// next request.

/** Everyone already has these, or they are too powerful to lend. */
const NOT_DELEGABLE = new Set(['employee', 'admin']);
export const MAX_HOURS = 7 * 24;
/** How far ahead a cover can be booked. */
const MAX_LEAD_MS = 14 * 24 * 3_600_000;
const MAX_ACTIVE_PER_PERSON = 3;
/** Ended delegations stay listed for a week, then Mongo removes them. */
const KEEP_AFTER_END_S = 7 * 24 * 60 * 60;

export interface Delegation {
  _id: string;
  from: string;
  to: string;
  groups: string[];
  created_at: Date;
  starts_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  /** Mongo removes the record after this; it is the end of the delegation plus a week. */
  purge_at: Date;
}
export type DelegationView = Omit<Delegation, '_id' | 'purge_at'> & { id: string; status: 'scheduled' | 'active' | 'ended'; active: boolean };

const groupName = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
export const grantSchema = z.object({
  to: z.string().min(1).max(100),
  /** Length of the cover in hours (default one day); `days` is the same in whole days. */
  hours: z.number().int().min(1).max(MAX_HOURS).optional(),
  days: z.number().int().min(1).max(MAX_HOURS / 24).optional(),
  /** When the cover begins; omitted means now. */
  starts_at: z.iso.datetime({ offset: true }).optional(),
  groups: z.array(groupName).min(1).max(20).optional(),
}).strict().refine(body => body.hours === undefined || body.days === undefined, { message: 'hours or days, not both' });

type UserRecord = { _id: string; id: string; groups: string[]; roles?: string[] };

export class Delegations {
  private readonly records: Collection<Delegation>;
  private readonly users: Collection<UserRecord>;
  constructor(db: Db, private readonly audit?: Audit, private readonly now: () => number = Date.now) {
    this.records = db.collection<Delegation>('delegations');
    this.users = db.collection<UserRecord>('users');
  }

  async initialise(): Promise<void> {
    await this.records.createIndex({ to: 1, expires_at: 1 });
    await this.records.createIndex({ from: 1, expires_at: 1 });
    await this.records.createIndex({ purge_at: 1 }, { expireAfterSeconds: 0 });
  }

  /** The groups a person holds in their own right, never including anything lent to them. */
  private async ownGroups(id: string): Promise<string[] | null> {
    const record = await this.users.findOne({ _id: id });
    if (!record) return null;
    return [...new Set([...record.groups, ...(record.roles?.includes('admin') ? ['admin'] : [])])];
  }

  /** In force right now. */
  private live(at = new Date(this.now())) {
    return { revoked_at: null, starts_at: { $lte: at }, expires_at: { $gt: at } };
  }

  /** In force now or booked for later. */
  private pending(at = new Date(this.now())) {
    return { revoked_at: null, expires_at: { $gt: at } };
  }

  private view(record: Delegation): DelegationView {
    const { _id, purge_at: _purge, ...rest } = record;
    const now = this.now();
    const status = record.revoked_at !== null || record.expires_at.getTime() <= now ? 'ended' : record.starts_at.getTime() > now ? 'scheduled' : 'active';
    return { id: _id, ...rest, status, active: status === 'active' };
  }

  /**
   * Groups lent to this person right now. Each is checked against what the lender still holds,
   * so a lender who loses a group stops lending it, and lent groups can never be lent onwards.
   */
  async lentTo(id: string): Promise<string[]> {
    const lent = await this.records.find({ to: id, ...this.live() }).limit(MAX_ACTIVE_PER_PERSON * 10).toArray();
    const groups = new Set<string>();
    for (const record of lent) {
      const own = await this.ownGroups(record.from);
      for (const group of record.groups) if (own?.includes(group) && !NOT_DELEGABLE.has(group)) groups.add(group);
    }
    return [...groups];
  }

  async grant(from: User, input: z.input<typeof grantSchema>): Promise<DelegationView> {
    const body = grantSchema.parse(input);
    if (body.to === from.id) throw new GatewayError('DELEGATE_TO_SELF', 400);
    const own = await this.ownGroups(from.id);
    if (!own) throw new GatewayError('UNAUTHENTICATED', 401);
    if (!await this.users.findOne({ _id: body.to }, { projection: { _id: 1 } })) throw new GatewayError('DELEGATE_UNKNOWN', 404);
    const lendable = own.filter(group => !NOT_DELEGABLE.has(group));
    const groups = body.groups ? [...new Set(body.groups)] : lendable;
    if (!groups.length) throw new GatewayError('NOTHING_TO_DELEGATE', 400);
    if (groups.some(group => !lendable.includes(group))) throw new GatewayError('GROUP_NOT_DELEGABLE', 403);

    const created = new Date(this.now());
    const hours = body.hours ?? (body.days ? body.days * 24 : 24);
    // A start a moment in the past (clock skew, a slow form) simply means now.
    const starts = new Date(Math.max(created.getTime(), body.starts_at ? Date.parse(body.starts_at) : 0));
    if (starts.getTime() - created.getTime() > MAX_LEAD_MS) throw new GatewayError('START_TOO_FAR', 400);
    if (body.starts_at && Date.parse(body.starts_at) < created.getTime() - 5 * 60_000) throw new GatewayError('START_IN_PAST', 400);
    // A new grant to the same colleague replaces the old one rather than stacking.
    await this.records.updateMany({ from: from.id, to: body.to, ...this.pending(created) }, { $set: { revoked_at: created } });
    if (await this.records.countDocuments({ from: from.id, ...this.pending(created) }) >= MAX_ACTIVE_PER_PERSON) throw new GatewayError('DELEGATION_LIMIT', 409);
    const expires = new Date(starts.getTime() + hours * 3_600_000);
    const record: Delegation = { _id: randomUUID(), from: from.id, to: body.to, groups, created_at: created, starts_at: starts, expires_at: expires, revoked_at: null, purge_at: new Date(expires.getTime() + KEEP_AFTER_END_S * 1000) };
    await this.records.insertOne(record);
    await this.record('delegation.granted', from, record, hours);
    return this.view(record);
  }

  /** The lender, the colleague handing it back, or an admin may end a delegation. */
  async revoke(by: User, id: string): Promise<DelegationView> {
    const record = await this.records.findOne({ _id: id });
    if (!record || (by.id !== record.from && by.id !== record.to && !by.groups.includes('admin'))) throw new GatewayError('DELEGATION_NOT_FOUND', 404);
    if (record.revoked_at || record.expires_at.getTime() <= this.now()) return this.view(record);
    const at = new Date(this.now());
    await this.records.updateOne({ _id: id, revoked_at: null }, { $set: { revoked_at: at, purge_at: new Date(at.getTime() + KEEP_AFTER_END_S * 1000) } });
    await this.record('delegation.revoked', by, record, 0);
    return this.view({ ...record, revoked_at: at });
  }

  /** What this person lent and was lent; an admin also sees every cover running or booked. */
  async list(user: User) {
    const recent = (filter: object) => this.records.find(filter).sort({ created_at: -1 }).limit(50).toArray();
    const [given, received] = await Promise.all([recent({ from: user.id }), recent({ to: user.id })]);
    const all = user.groups.includes('admin') ? await recent(this.pending()) : undefined;
    return { given: given.map(r => this.view(r)), received: received.map(r => this.view(r)), ...(all ? { active: all.map(r => this.view(r)) } : {}), max_hours: MAX_HOURS };
  }

  /** Who I am, which posts I am covering right now and until when, and what I could lend. */
  async me(user: User) {
    const own = await this.ownGroups(user.id) ?? [];
    const lent = await this.lentTo(user.id);
    const covering = await this.records.find({ to: user.id, ...this.live() }).sort({ expires_at: 1 }).limit(10).toArray();
    return {
      id: user.id, own_groups: own, delegated_groups: lent.filter(g => !own.includes(g)), groups: user.groups,
      lendable_groups: own.filter(g => !NOT_DELEGABLE.has(g)), max_hours: MAX_HOURS,
      covering: covering.map(r => ({ id: r._id, for: r.from, groups: r.groups.filter(g => lent.includes(g)), until: r.expires_at })).filter(c => c.groups.length),
    };
  }

  // Metadata only: pseudonymous actor, the groups and the duration. Outside request statistics.
  private async record(stage: 'delegation.granted' | 'delegation.revoked', actor: User, record: Delegation, hours: number) {
    if (!this.audit) return;
    await this.audit.write({
      request_id: randomUUID(), ts: new Date(this.now()), user_pseudo: this.audit.pseudo(actor),
      conversation_pseudo: this.audit.fingerprint('conversation', `delegation:${record._id}`),
      stage, categories: record.groups.map(g => `group:${g}`), counts: { hours }, rule_ids: [stage],
      policy_version: 'delegation', action: 'allow', model_called: false, via: [], stage_ms: {}, total_ms: 0,
    });
  }
}
