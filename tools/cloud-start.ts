/** Private synthetic cloud demo: persistent Atlas storage, real production gateway. */
import { MongoClient } from 'mongodb';
import { loadConfig } from '../apps/gateway/src/config.js';
import { installConsolePrivacyFilter, safeLog } from '../apps/gateway/src/logger.js';
import { seedDatabase } from '../seed/seed.js';

installConsolePrivacyFilter();
async function start() {
  const config = loadConfig();
  if (config.EVAL_MODE || config.BASELINE_MODE || !config.GATEWAY_PROXY_SECRET || !config.FINGERPRINT_KEY || !config.RETRIEVAL_MODULE || !config.APPROVALS_MODULE) throw new Error('Invalid hosted demo configuration');
  if (process.env.SEED_DEMO_ON_START === 'true') {
    if (!config.DEMO_AUTH || config.MONGODB_DB !== 'leakshield_cloud_demo') throw new Error('Demo seed requires its dedicated database');
    const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
    try {
      await client.connect();
      const db = client.db(config.MONGODB_DB);
      // Seed only when fixture initialization is missing, preserving normal restart data.
      const [users, chunks] = await Promise.all([db.collection('users').countDocuments(), db.collection('chunks').countDocuments()]);
      if (users < 5 || chunks < 10) await seedDatabase(db, { fingerprintKey: config.FINGERPRINT_KEY });
    } finally { await client.close(); }
  }
  await import('../apps/gateway/src/server.js');
}
void start().catch(() => { safeLog('START_FAILED'); process.exit(1); });
