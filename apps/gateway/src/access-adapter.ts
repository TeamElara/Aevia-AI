import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Db } from 'mongodb';
import { z } from 'zod';
import type { Chunk, Retrieve, User } from '../../../types.js';
import { GatewayError } from './errors.js';

/** Adapter for Alwaz's published createRetriever/assembleChunks API; never edits his modules. */
export async function loadAccessAdapter(db: Db, modulePath: string, fingerprintKey?: string) {
  const path = resolve(modulePath);
  const loaded = await import(pathToFileURL(path).href);
  if (typeof loaded.retrieve === 'function' && typeof loaded.restrictedOverlap === 'function') {
    return { retrieve: loaded.retrieve as Retrieve, restrictedOverlap: loaded.restrictedOverlap as (text: string, user: User) => Promise<boolean>, principal: undefined };
  }
  if (typeof loaded.createRetriever !== 'function' || typeof loaded.assembleChunks !== 'function' || !fingerprintKey || fingerprintKey.length < 32) throw new GatewayError('RETRIEVAL_CONFIG_INVALID');
  const fingerprintModule = await import(pathToFileURL(resolve(dirname(path), 'fingerprints.js')).href);
  const fingerprints = fingerprintModule.createFingerprinter(fingerprintKey);
  const collection = db.collection('chunks');
  const retrieveRaw = loaded.createRetriever(collection);
  const principal = async (id: string): Promise<User> => {
    const record = await db.collection<{ _id: string; id: string; groups: string[]; roles?: string[] }>('users').findOne({ _id: id });
    if (!record) throw new GatewayError('UNAUTHENTICATED', 401);
    return z.object({ id: z.string().min(1), groups: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)).max(20) })
      .parse({ id: record.id, groups: [...new Set([...record.groups, ...(record.roles?.includes('admin') ? ['admin'] : [])])] });
  };
  const retrieve: Retrieve = async (user, query) => {
    const current = await principal(user.id);
    const found = await retrieveRaw(current, query.slice(0, 4000), { external: false });
    const fresh = await loaded.assembleChunks(collection, current, found, { external: false });
    return fresh.map((c: Record<string, unknown>): Chunk => ({
      doc_id: c.document_id as string, title: c.title as string, text: c.text as string,
      allowed_groups: c.allowed_groups as string[], allowed_users: c.allowed_users as string[],
      classification: c.classification as Chunk['classification'], external_llm: c.external_llm as Chunk['external_llm'],
      injection_score: c.injection_score as number,
      canary: typeof c.text === 'string' ? c.text.match(/LS-CANARY-[a-zA-Z0-9-]+/)?.[0] : undefined,
    }));
  };
  const restrictedOverlap = async (text: string, user: User): Promise<boolean> => {
    const current = await principal(user.id);
    const denied = collection.find({
      classification: { $in: ['restricted', 'confidential'] },
      $nor: [{ allowed_users: current.id }, { allowed_groups: { $in: current.groups } }],
    }, { projection: { text: 1, fingerprints: 1 } });
    for await (const chunk of denied) {
      if (fingerprints.matches(text, chunk.fingerprints ?? fingerprints.fingerprint(chunk.text))) return true;
    }
    return false;
  };
  return { retrieve, restrictedOverlap, principal };
}
