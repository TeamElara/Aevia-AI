import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest();

export function createApprovals({ metadata, revalidate, replay, now = Date.now, ttlMs = 600_000, key = randomBytes(32) }) {
  if (!metadata?.insertOne || !metadata?.updateOne || typeof revalidate !== 'function' || typeof replay !== 'function' || key.length !== 32 || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 600_000) throw new TypeError('Approval dependencies required');
  const pending = new Map();
  const purge = () => { for (const [id, item] of pending) if (now() >= item.expiresAt) pending.delete(id); };
  const timer = setInterval(purge, Math.min(ttlMs, 30_000)); timer.unref();
  const isAdmin = actor => { if (!actor?.id || (!Array.isArray(actor.roles) || !actor.roles.includes('admin'))) throw new Error('Admin required'); };
  return {
    async enqueue(payload, ctx) {
      purge();
      if (!ctx?.user?.id || !ctx.request_id) throw new TypeError('Authenticated context required');
      if (pending.size >= 1000) throw new Error('Approval queue full');
      const id = randomUUID(), expiresAt = now() + ttlMs;
      const clear = Buffer.from(JSON.stringify({ payload, ctx }));
      if (clear.length > 1_000_000) throw new Error('Approval payload too large');
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(id));
      const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
      // No payload, excerpts, prompts, principal identifiers or finding values in Mongo.
      await metadata.insertOne({ _id: id, request_hash: hash(clear).toString('hex'), status: 'pending', created_at: new Date(now()), expires_at: new Date(expiresAt) });
      pending.set(id, { encrypted, iv, tag: cipher.getAuthTag(), digest: hash(clear), expiresAt });
      return { id, expires_at: new Date(expiresAt).toISOString() };
    },
    async approve(id, actor, expectedHash) {
      isAdmin(actor); purge();
      const item = pending.get(id);
      if (!item) throw new Error('Approval missing, consumed or expired');
      if (expectedHash !== undefined && expectedHash !== item.digest.toString('hex')) throw new Error('Approval hash mismatch');
      pending.delete(id); // Consume synchronously before any await: at most one replay attempt.
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, item.iv);
        decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(item.tag);
        const clear = Buffer.concat([decipher.update(item.encrypted), decipher.final()]);
        if (!timingSafeEqual(hash(clear), item.digest)) throw new Error('Approval integrity failure');
        const { payload, ctx } = JSON.parse(clear.toString('utf8'));
        if (now() >= item.expiresAt || !(await revalidate(payload, ctx))) throw new Error('Approval no longer allowed');
        if (now() >= item.expiresAt) throw new Error('Approval expired');
        await metadata.updateOne({ _id: id }, { $set: { status: 'replaying' } });
        if (now() >= item.expiresAt) throw new Error('Approval expired');
        const result = await replay(payload, ctx); // Replay enters the full gateway policy + ACL pipeline.
        await metadata.updateOne({ _id: id }, { $set: { status: 'approved' } });
        return result;
      } catch (error) {
        await metadata.updateOne({ _id: id }, { $set: { status: 'failed' } });
        throw error;
      }
    },
    async reject(id, actor) {
      isAdmin(actor); purge();
      if (!pending.delete(id)) throw new Error('Approval missing, consumed or expired');
      await metadata.updateOne({ _id: id }, { $set: { status: 'rejected' } });
    },
    list(actor) { isAdmin(actor); purge(); return [...pending].map(([id, item]) => ({ id, request_hash: item.digest.toString('hex'), expires_at: new Date(item.expiresAt).toISOString() })); },
    close() { clearInterval(timer); pending.clear(); },
  };
}
