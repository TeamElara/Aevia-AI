/** Isolated real-provider rehearsal using the production server and a temporary seeded Mongo. */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { seedDatabase } from '../seed/seed.js';

const baseline = process.argv.includes('--baseline');
const local = process.argv.includes('--ollama');
const port = Number(process.env.VALIDATION_PORT ?? (baseline ? 8081 : 8080));
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid validation port');
if (!local && (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL)) throw new Error('Configure Groq locally first');
const mongo = await MongoMemoryServer.create({ binary: { version: '8.0.16' } });
const client = await new MongoClient(mongo.getUri()).connect();
const fingerprintKey = randomBytes(32).toString('hex');
await seedDatabase(client.db('aevia_validation'), { fingerprintKey });
const child = spawn(process.execPath, ['--import', 'tsx', 'apps/gateway/src/server.ts'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port),
    JWT_SECRET: randomBytes(32).toString('hex'), AUDIT_HMAC_SECRET: randomBytes(32).toString('hex'),
    FINGERPRINT_KEY: fingerprintKey, MONGODB_URI: mongo.getUri(), MONGODB_DB: 'aevia_validation',
    LLM_PROVIDER: local ? 'ollama' : 'groq', OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5:0.5b',
    OLLAMA_URL: process.env.OLLAMA_URL || 'http://127.0.0.1:11435/v1',
    CLASSIFIER_BACKEND: 'none', RETRIEVAL_MODULE: 'apps/gateway/src/retrieval/index.js',
    APPROVALS_MODULE: 'apps/gateway/src/approvals/index.js', DEMO_AUTH: 'true', EVAL_MODE: '1',
    BASELINE_MODE: baseline ? 'true' : 'false', API_KEYS_JSON: '[]', CORS_ORIGIN: 'http://localhost:5173' },
});
let stopping = false;
const stop = async () => {
  if (stopping) return; stopping = true;
  child.kill('SIGTERM');
  await client.close(); await mongo.stop(); process.exit(0);
};
process.once('SIGINT', stop); process.once('SIGTERM', stop);
process.stdin.on('data', data => { if (String(data).trim() === 'stop') void stop(); });
child.once('exit', () => { if (!stopping) void stop(); });
console.log(`Validation host: loopback:${port}, ${local ? 'real Ollama' : 'real Groq'}, ${baseline ? 'UNPROTECTED SYNTHETIC BASELINE' : 'protected'}, temporary Mongo. Type stop to close.`);
