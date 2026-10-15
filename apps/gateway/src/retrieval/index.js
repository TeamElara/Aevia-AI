import { createHash } from 'node:crypto';
function identity(user) {
  if (!user || typeof user.id !== 'string' || !user.id || !Array.isArray(user.groups) || !user.groups.every(g => typeof g === 'string')) throw new TypeError('Trusted authenticated user required');
}
export function aclFilter(user, { external = true, approved = false } = {}) {
  identity(user);
  return { quarantined: false, ...(external ? { external_llm: { $in: approved ? ['allow', 'approval'] : ['allow'] } } : {}),
    $or: [{ allowed_users: user.id }, { allowed_groups: { $in: user.groups } }] };
}
export function authorized(user, chunk, { external = true, approved = false } = {}) {
  identity(user);
  return chunk?.quarantined === false && Number.isFinite(chunk.injection_score) && chunk.injection_score < 0.85 && ['allow', 'approval', 'deny'].includes(chunk.external_llm) &&
    (!external || chunk.external_llm === 'allow' || approved && chunk.external_llm === 'approval') &&
    (Array.isArray(chunk.allowed_users) && chunk.allowed_users.includes(user.id) || Array.isArray(chunk.allowed_groups) && chunk.allowed_groups.some(g => user.groups.includes(g)));
}
export async function quarantineHighScores(collection, onQuarantine = async () => {}) {
  const ids = await collection.distinct('document_id', { injection_score: { $gte: 0.85 }, quarantined: { $ne: true } });
  if (ids.length) {
    await collection.updateMany({ document_id: { $in: ids } }, { $set: { quarantined: true } });
    await onQuarantine({ action: 'quarantine', document_ids: ids });
  }
  return ids;
}
export function createRetriever(collection, { onQuarantine } = {}) {
  return async function retrieve(user, query, options = {}) {
    const { limit = 8 } = options;
    if (typeof query !== 'string' || query.length > 4000 || !query.trim()) throw new TypeError('Invalid query');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError('Invalid limit');
    await quarantineHighScores(collection, onQuarantine);
    // Mongo's text index applies search + ACL before sort/top-k; query is data, never an operator object.
    const filter = { ...aclFilter(user, options), $text: { $search: query } };
    const chunks = await collection.find(filter).sort({ _id: 1 }).limit(limit).toArray();
    return chunks.filter(chunk => authorized(user, chunk, options));
  };
}
export async function assembleChunks(collection, user, chunks, options = {}) {
  identity(user);
  await quarantineHighScores(collection);
  const assembled = [];
  for (const candidate of chunks) {
    const fresh = await collection.findOne({ $and: [{ _id: candidate._id }, aclFilter(user, options)] });
    if (!authorized(user, fresh, options)) throw new Error('Retrieval authorization changed');
    if (createHash('sha256').update(fresh.text).digest('hex') !== fresh.content_hash) throw new Error('Chunk integrity failure');
    assembled.push(fresh);
  }
  return assembled;
}
