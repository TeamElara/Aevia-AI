import { documents, users } from './corpus.js';
import { ingestDocument } from '../apps/gateway/src/retrieval/ingest.js';
import { createFingerprinter } from '../apps/gateway/src/retrieval/fingerprints.js';
import { issueToken } from './auth.js';
import { writeFile } from 'node:fs/promises';
export async function seedDatabase(db, { fingerprintKey = process.env.FINGERPRINT_KEY } = {}) {
  const fingerprint = createFingerprinter(fingerprintKey);
  const chunks = documents.flatMap(d => ingestDocument(d)).map(c => ({ ...c, fingerprints: ['restricted', 'confidential'].includes(c.classification) ? fingerprint.fingerprint(c.text) : [] }));
  const collection = db.collection('chunks');
  await collection.createIndex({ injection_score: 1, quarantined: 1 });
  await collection.createIndex({ text: 'text', title: 'text' });
  await collection.createIndex({ allowed_groups: 1, quarantined: 1, external_llm: 1 });
  await collection.createIndex({ allowed_users: 1, quarantined: 1, external_llm: 1 });
  await db.collection('approvals').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  for (const chunk of chunks) await collection.replaceOne({ _id: chunk._id }, chunk, { upsert: true });
  for (const user of users) await db.collection('users').replaceOne({ _id: user.id }, { _id: user.id, ...user }, { upsert: true });
  return { documents: documents.length, chunks: chunks.length, quarantined: chunks.filter(c => c.quarantined).length };
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Set JWT_SECRET to at least 32 bytes');
  if (process.argv.includes('--tokens')) {
    await writeFile(new URL('./tokens.json', import.meta.url), JSON.stringify(Object.fromEntries(users.map(user => [user.id, issueToken(user, secret)])), null, 2), { mode: 0o600 });
    console.log('Demo JWTs written to ignored seed/tokens.json');
  } else {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(process.env.MONGO_URL ?? 'mongodb://localhost:27017');
    try { await client.connect(); console.log(await seedDatabase(client.db('leakshield'))); } finally { await client.close(); }
  }
}
