import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Db } from 'mongodb';
import type { ApprovalContext, ApprovalService, ChatResult, Chunk, Message, User } from '../../../types.js';
import { Audit } from './audit.js';
import { GatewayError } from './errors.js';
import { Gateway } from './pipeline.js';
import { PolicyStore } from './policy.js';

interface Reference { owner: string; conversation: string; approvalId: string; expires: number; }
interface Grant { hash: string; owner: string; conversation: string; expires: number; }
interface StoredApproval { _id: string; request_hash: string; status: string; created_at: Date; expires_at: Date; user_pseudo?: string; doc_ids?: string[]; reason?: string; }
export interface ApprovalMetadata { approval_id: string; request_hash: string; user_pseudo: string; doc_ids: string[]; reason: string; status: string; created_at: string; expires_at: string; }

/** Alwaz's encrypted queue owns storage. Every replay re-enters Mahatva's full pipeline. */
export async function createApprovalBridge(options: {
  db: Db; audit: Audit; policies: PolicyStore; gateway: () => Gateway;
  principal?: (id: string) => Promise<User>; modulePath?: string;
}) {
  const mod = await import(pathToFileURL(resolve(options.modulePath ?? 'apps/gateway/src/approvals/index.js')).href);
  if (typeof mod.createApprovals !== 'function') throw new GatewayError('APPROVAL_CONFIG_INVALID');
  const metadata = options.db.collection<StoredApproval>('approvals');
  await metadata.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  const refs = new Map<string, Reference>(); const grants = new Map<string, Grant>(); const completed = new Map<string, ChatResult>();
  const purge = () => { for (const [id, r] of refs) if (r.expires <= Date.now()) { refs.delete(id); completed.delete(id); } };
  const timer = setInterval(purge, 30_000); timer.unref();
  const current = async (user: User) => options.principal ? await options.principal(user.id) : user;
  const actor = async (user: User) => {
    const fresh = await current(user);
    if (!fresh.groups.includes('admin')) throw new GatewayError('FORBIDDEN', 403);
    return { id: fresh.id, roles: ['admin'] };
  };
  const queue = mod.createApprovals({ metadata,
    revalidate: async (_payload: unknown, ctx: ApprovalContext) => options.policies.snapshot().version === ctx.policyVersion,
    replay: async (_payload: unknown, ctx: ApprovalContext) => {
      const user = await current(ctx.user);
      const grantId = randomUUID();
      grants.set(grantId, { hash: ctx.requestHash, owner: user.id, conversation: ctx.conversationId, expires: Date.now() + 10_000 });
      try {
        const result = await options.gateway().run(user, { messages: ctx.replayMessages ?? [], conversationId: ctx.conversationId, approvalId: grantId, attachedDoc: ctx.attachedDoc });
        if (['deny', 'require_approval'].includes(result.action) || (result.action === 'block' && result.provider_calls === 0)) throw new GatewayError('APPROVAL_REVALIDATION_FAILED', 409);
        completed.set(ctx.requestId, { ...result, request_id: ctx.requestId, captured_payload: undefined });
        return { request_id: ctx.requestId, status: 'completed' };
      } finally { grants.delete(grantId); }
    },
  });
  const service: ApprovalService = {
    async enqueue(payload: { messages: Message[]; chunks: Chunk[] }, ctx: ApprovalContext) {
      purge();
      if (refs.size >= 1000) throw new GatewayError('APPROVAL_CAPACITY');
      const approval = await queue.enqueue(payload, { ...ctx, request_id: ctx.requestId });
      try {
        await metadata.updateOne({ _id: approval.id }, { $set: { user_pseudo: options.audit.pseudo(ctx.user), doc_ids: [...new Set(payload.chunks.map(c => c.doc_id))], reason: 'Confidential content requires external-provider approval.' } });
        refs.set(ctx.requestId, { owner: ctx.user.id, conversation: ctx.conversationId, approvalId: approval.id, expires: Date.parse(approval.expires_at) });
        return approval;
      } catch {
        await queue.reject(approval.id, { id: 'system', roles: ['admin'] }).catch(() => {});
        throw new GatewayError('APPROVAL_UNAVAILABLE');
      }
    },
    async verifyAndConsume(id, ctx) {
      const grant = grants.get(id); grants.delete(id);
      return !!grant && grant.expires > Date.now() && grant.owner === ctx.user.id && grant.conversation === ctx.conversationId && grant.hash === ctx.requestHash;
    },
  };
  const format = (row: StoredApproval): ApprovalMetadata => ({
    approval_id: row._id, request_hash: row.request_hash, user_pseudo: row.user_pseudo ?? '', doc_ids: row.doc_ids ?? [], reason: row.reason ?? 'Approval required.',
    status: row.expires_at.getTime() <= Date.now() && row.status === 'pending' ? 'expired' : row.status === 'failed' ? 'rejected' : row.status === 'replaying' ? 'pending' : row.status,
    created_at: row.created_at.toISOString(), expires_at: row.expires_at.toISOString(),
  });
  return {
    service,
    async list(user: User) {
      const admin = await actor(user); const live = new Set(queue.list(admin).map((r: { id: string }) => r.id));
      return (await metadata.find().sort({ created_at: -1 }).limit(1000).toArray()).map(row => {
        const out = format(row); if (out.status === 'pending' && !live.has(row._id) && row.status !== 'replaying') out.status = 'expired'; return out;
      });
    },
    async decide(user: User, id: string, decision: 'approve' | 'reject', expectedHash?: string) {
      const admin = await actor(user); const row = await metadata.findOne({ _id: id });
      if (!row || row.status !== 'pending' || row.expires_at.getTime() <= Date.now()) throw new GatewayError('APPROVAL_NOT_PENDING', 409);
      try {
        if (decision === 'approve') await queue.approve(id, admin, expectedHash ?? row.request_hash);
        else await queue.reject(id, admin);
      } catch { throw new GatewayError('APPROVAL_UNAVAILABLE', 409); }
      const updated = await metadata.findOne({ _id: id });
      if (!updated) throw new GatewayError('APPROVAL_UNAVAILABLE', 409);
      return format(updated);
    },
    async result(user: User, requestId: string, conversationId: string): Promise<ChatResult | null> {
      purge(); const ref = refs.get(requestId);
      if (!ref || ref.owner !== user.id || ref.conversation !== conversationId) throw new GatewayError('RESULT_NOT_FOUND', 404);
      const ready = completed.get(requestId);
      if (ready) { completed.delete(requestId); refs.delete(requestId); return ready; }
      const row = await metadata.findOne({ _id: ref.approvalId });
      if (row && ['pending', 'replaying'].includes(row.status)) return null;
      refs.delete(requestId);
      return { request_id: requestId, conversation_id: conversationId, answer: '', action: 'deny', reason: 'Approval was rejected, expired or invalidated.', findings: [], stage_ms: {}, provider_calls: 0, policy_version: options.policies.snapshot().version, sent_to_model: null, citations: [] };
    },
    close() { clearInterval(timer); queue.close(); refs.clear(); grants.clear(); completed.clear(); },
  };
}
export type ApprovalBridge = Awaited<ReturnType<typeof createApprovalBridge>>;
