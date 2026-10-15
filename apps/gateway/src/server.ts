import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';
import type { ApprovalService, DetectAll, Retrieve } from '../../../types.js';
import { createApp } from './app.js';
import { loadAccessAdapter } from './access-adapter.js';
import { Audit, MongoAuditStore } from './audit.js';
import { Auth } from './auth.js';
import { OfflineBaseline } from './baseline.js';
import { loadConfig } from './config.js';
import { GatewayError } from './errors.js';
import { installConsolePrivacyFilter, safeLog } from './logger.js';
import { Gateway } from './pipeline.js';
import { PolicyStore } from './policy.js';
import { HttpProvider } from './provider.js';
import { Scanner } from './scanner.js';
import { ConversationVault } from './vault.js';

installConsolePrivacyFilter();
async function start() {
  const config = loadConfig();
  let detectorReady = false;
  let detect: DetectAll = () => { throw new GatewayError('SCANNER_UNAVAILABLE'); };
  try {
    const loaded = await import(pathToFileURL(resolve(config.DETECTOR_MODULE)).href);
    if (typeof loaded.detectAll === 'function') { detect = loaded.detectAll as DetectAll; detectorReady = true; }
  } catch { /* Missing teammate module is explicit on /ready and never treated as clean. */ }
  let retrieve: Retrieve | undefined;
  let restrictedOverlap: ((text: string, user: import('../../../types.js').User) => Promise<boolean>) | undefined;
  let principal: ((id: string) => Promise<import('../../../types.js').User>) | undefined;
  let approvals: ApprovalService | undefined;
  if (config.APPROVALS_MODULE) {
    const loaded = await import(pathToFileURL(resolve(config.APPROVALS_MODULE)).href);
    if (typeof loaded.approvals?.enqueue !== 'function' || typeof loaded.approvals?.verifyAndConsume !== 'function') throw new GatewayError('APPROVAL_CONFIG_INVALID');
    approvals = loaded.approvals as ApprovalService;
  }
  const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 5000 });
  await client.connect();
  if (config.RETRIEVAL_MODULE) ({ retrieve, restrictedOverlap, principal } = await loadAccessAdapter(client.db(config.MONGODB_DB), config.RETRIEVAL_MODULE, config.FINGERPRINT_KEY));
  const store = new MongoAuditStore(client.db(config.MONGODB_DB));
  await store.initialise();
  const audit = new Audit(store, config.AUDIT_HMAC_SECRET);
  const policies = new PolicyStore(config.POLICY_PATH);
  policies.snapshot();
  const vault = new ConversationVault();
  const provider = new HttpProvider(config.LLM_PROVIDER === 'groq'
    ? { kind: 'groq', baseURL: 'https://api.groq.com/openai/v1', apiKey: config.GROQ_API_KEY, model: config.GROQ_MODEL! }
    : { kind: 'ollama', baseURL: config.OLLAMA_URL, model: config.OLLAMA_MODEL! });
  const gateway = new Gateway({ scanner: new Scanner(detect), provider, audit, policies, vault, retrieve, approvals, restrictedOverlap, evalMode: config.EVAL_MODE });
  const baseline = config.BASELINE_MODE ? new OfflineBaseline(provider, audit, async query => {
    const documents = await client.db(config.MONGODB_DB).collection('chunks').find({ $text: { $search: query.slice(0, 4000) } }).sort({ _id: 1 }).limit(8).toArray();
    return documents.map(d => d.text as string);
  }) : undefined;
  const app = createApp({ gateway, auth: new Auth(config.JWT_SECRET, config.apiKeys, principal), audit, policies, ready: () => detectorReady, corsOrigin: config.CORS_ORIGIN, demoAuth: config.DEMO_AUTH, signingSecret: config.JWT_SECRET, evalMode: config.EVAL_MODE, baseline });
  const server = app.listen(config.PORT, config.HOST, () => safeLog('STARTED', { port: config.PORT }));
  const stop = () => {
    server.close(() => { vault.close(); policies.close(); baseline?.close(); void client.close().then(() => process.exit(0)); });
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.on('error', () => { safeLog('START_FAILED'); void client.close().then(() => process.exit(1)); });
}
process.on('uncaughtException', () => { safeLog('UNCAUGHT_EXCEPTION'); process.exit(1); });
process.on('unhandledRejection', () => { safeLog('UNHANDLED_REJECTION'); process.exit(1); });
start().catch(() => { safeLog('START_FAILED'); process.exit(1); });
