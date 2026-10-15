import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.FINGERPRINT_KEY || process.env.FINGERPRINT_KEY.length < 32) throw new Error('Set FINGERPRINT_KEY before seeding the synthetic demo database.');
const { seedDatabase } = await import(pathToFileURL(resolve('seed/seed.js')).href);
const client = new MongoClient(process.env.MONGODB_URI ?? process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017');
try {
  await client.connect();
  const result = await seedDatabase(client.db(process.env.MONGODB_DB ?? 'aevia'), { fingerprintKey: process.env.FINGERPRINT_KEY });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally { await client.close(); }
