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
// Conservative lexical relevance gate: ordinary chat must not disclose a
// reference merely because its body contains a common word. Explicit attachments
// use the access adapter's separate ACL-checked selection path.
const queryNoise = new Set('a an the and or for of to in on at by with from this that these those is are was were be been being it its my our your their me us you i we they what when where how why who please can could would should do does did as about into using use write draft explain summarise summarize tell show give ek ke ki ka ko hai hain liye aur mein se'.split(' '));
function terms(text) {
  return new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(term => term.length > 1 && !queryNoise.has(term))
    .map(term => term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : term));
}
function relevant(chunk, queryTerms) {
  const titleTerms = terms(chunk.title ?? '');
  const documentTerms = terms(`${chunk.title ?? ''} ${chunk.text ?? ''}`);
  const titleMatch = [...queryTerms].some(term => titleTerms.has(term));
  const matched = [...queryTerms].filter(term => documentTerms.has(term)).length;
  const required = ['approval', 'deny'].includes(chunk.external_llm) ? 2 : Math.min(2, queryTerms.size);
  return titleMatch && matched >= required;
}
export function createRetriever(collection, { onQuarantine, minimumScoreRatio = 0.5 } = {}) {
  if (!Number.isFinite(minimumScoreRatio) || minimumScoreRatio < 0 || minimumScoreRatio > 1) throw new TypeError('Invalid score ratio');
  return async function retrieve(user, query, options = {}) {
    const { limit = 8 } = options;
    if (typeof query !== 'string' || query.length > 4000 || !query.trim()) throw new TypeError('Invalid query');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError('Invalid limit');
    await quarantineHighScores(collection, onQuarantine);
    // Mongo's text index applies search + ACL before sort/top-k; query is data, never an operator object.
    const filter = { ...aclFilter(user, options), $text: { $search: query } };
    const queryTerms = terms(query);
    // ACLs are inside the Mongo filter, before relevance ranking or candidate cap.
    // Rank a bounded candidate pool, apply lexical eligibility, then final top-k.
    const chunks = await collection.find(filter, { projection: { score: { $meta: 'textScore' } } })
      .sort({ score: { $meta: 'textScore' }, _id: 1 }).limit(50).toArray();
    const eligible = chunks.filter(chunk => authorized(user, chunk, options) && relevant(chunk, queryTerms));
    const topScore = eligible[0]?.score ?? 0;
    return eligible.filter(chunk => Number.isFinite(chunk.score) && chunk.score >= topScore * minimumScoreRatio).slice(0, limit);
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
