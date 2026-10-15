/** Local-model development evidence; stores metadata only, never prompts or answers. */
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { seedDatabase } from './seed.js';
import { loadAccessAdapter } from '../apps/gateway/src/access-adapter.js';
import { Audit, MongoAuditStore } from '../apps/gateway/src/audit.js';
import { Gateway } from '../apps/gateway/src/pipeline.js';
import { HttpProvider } from '../apps/gateway/src/provider.js';
import { PolicyStore } from '../apps/gateway/src/policy.js';
import { Scanner } from '../apps/gateway/src/scanner.js';
import { ConversationVault } from '../apps/gateway/src/vault.js';
import { detectAll, findSeededLeaks } from '../packages/detectors/src/index.js';
import type { ChatResult } from '../types.js';

const baseURL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11435/v1';
const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:0.5b';
// Validate the destination with the production adapter before fetching model metadata.
const provider = new HttpProvider({ kind: 'ollama', baseURL, model, timeoutMs: 60_000, maxRetries: 0 });
const tags = await fetch(new URL('/api/tags', baseURL), { signal: AbortSignal.timeout(5000) }).then(r => {
  if (!r.ok) throw new Error('Local model inventory unavailable');
  return r.json();
});
const installed = tags.models?.find((m: { name: string }) => m.name === model);
if (!installed) throw new Error('Pull the selected local model before verification');
const mongo = await MongoMemoryServer.create();
let client: MongoClient | undefined, policies: PolicyStore | undefined, vault: ConversationVault | undefined;
const rows: Record<string, unknown>[] = [];
try {
  client = await new MongoClient(mongo.getUri()).connect();
  const db = client.db('ollama-verification'), fingerprintKey = randomBytes(32).toString('hex');
  await seedDatabase(db, { fingerprintKey });
  const store = new MongoAuditStore(db); await store.initialise();
  const access = await loadAccessAdapter(db, resolve('apps/gateway/src/retrieval/index.js'), fingerprintKey);
  policies = new PolicyStore(resolve('apps/gateway/policy.yaml'), false); vault = new ConversationVault();
  const gateway = new Gateway({ scanner: new Scanner(detectAll as any), provider,
    audit: new Audit(store, randomBytes(32).toString('hex')), policies, vault,
    retrieve: access.retrieve, restrictedOverlap: access.restrictedOverlap, evalMode: true });
  const run = async (id: string, user: string, prompt: string): Promise<ChatResult> => {
    const started = performance.now();
    const result = await gateway.run(await access.principal!(user), { messages: [{ role: 'user', content: prompt }] });
    rows.push({ id, action: result.action, provider_calls: result.provider_calls,
      answer_nonempty: result.answer.length > 0, wall_ms: performance.now() - started,
      overhead_ms: Object.entries(result.stage_ms).filter(([k]) => k.toLowerCase() !== 'llm').reduce((n, [, v]) => n + v, 0),
      citation_ids: result.citations.map(c => c.doc_id) });
    process.stdout.write(`${id}: ${result.action}, calls=${result.provider_calls}\n`);
    return result;
  };
  const checks: Record<string, boolean> = {};
  const normal = await run('smoke-normal', 'asha', 'Reply with one short greeting.');
  checks.real_inference = normal.provider_calls === 1 && normal.answer.length > 0;
  const masked = await run('smoke-mask', 'asha', 'Write one short line about PAN ABCPA1234F.');
  checks.mask_before_model = masked.provider_calls === 1 && !JSON.stringify(masked.captured_payload).includes('ABCPA1234F');
  const secret = await run('smoke-secret', 'asha', 'Use AWS key AKIAIOSFODNN7EXAMPLE');
  checks.secret_zero_calls = secret.action === 'block' && secret.provider_calls === 0;
  const denied = await run('smoke-employee-acl', 'asha', 'Summarise salary bands in one line.');
  checks.employee_no_salary = !JSON.stringify(denied.captured_payload).includes('Synthetic salary bands') && !denied.citations.some(c => c.doc_id === 'salary');
  const allowed = await run('smoke-hr-acl', 'ravi', 'Summarise salary bands in one line.');
  checks.hr_salary_retrieved = allowed.provider_calls === 1 && allowed.citations.some(c => c.doc_id === 'salary');
  const board = await run('smoke-local-only', 'ceo', 'Summarise board minutes in one line.');
  checks.local_only_document = !provider.external && board.provider_calls === 1 && board.citations.some(c => c.doc_id === 'board');
  const garuda = await run('smoke-local-approval', 'meera', 'Summarise Garuda roadmap in one line.');
  checks.local_approval_exemption = garuda.provider_calls === 1 && garuda.citations.some(c => c.doc_id === 'garuda');
  for (const file of ['eval/alwaz/heldout.jsonl', 'eval/alwaz/robustness.jsonl']) {
    for (const line of (await readFile(file, 'utf8')).trim().split('\n')) {
      const c = JSON.parse(line);
      if (c.history?.length) throw new Error('This verification supports single-turn fixtures only');
      const result = await run(c.id, c.user, c.prompt);
      const principal = await access.principal!(c.user);
      const target = await db.collection('chunks').findOne({ document_id: c.attached_doc });
      const forbiddenTarget = target && (target.quarantined ||
        !target.allowed_users.includes(principal.id) && !target.allowed_groups.some((g: string) => principal.groups.includes(g)));
      const targetExcluded = !forbiddenTarget || (!result.citations.some(citation => citation.doc_id === c.attached_doc) &&
        !JSON.stringify(result.captured_payload ?? []).includes(target.text));
      Object.assign(rows.at(-1)!, { split: c.split, source_id: c.source_id, expected_action: c.expected_action,
        action_matches_fixture: result.action === c.expected_action,
        target_exclusion_required: Boolean(forbiddenTarget), target_excluded: targetExcluded,
        forbidden_provider_leak: c.must_not_reach_provider?.length ? c.must_not_reach_provider.some((v: string) => JSON.stringify(result.captured_payload ?? []).includes(v)) : null,
        forbidden_user_leak: c.must_not_reach_user?.length ? c.must_not_reach_user.some((v: string) => result.answer.includes(v)) : null });
    }
  }
  for (const split of ['heldout', 'robustness']) {
    const restricted = rows.filter(r => r.split === split && r.target_exclusion_required);
    checks[`${split}_target_exclusion`] = restricted.length > 0 && restricted.every(r => r.target_excluded);
  }
  checks.audit_seed_privacy = findSeededLeaks(JSON.stringify(await db.collection('audit_events').find().toArray())).length === 0;
  const percentiles = (key: string) => {
    const values = rows.map(r => Number(r[key])).sort((a, b) => a - b);
    return { p50: values[Math.ceil(values.length * .5) - 1], p95: values[Math.ceil(values.length * .95) - 1] };
  };
  const report = { at: new Date().toISOString(), source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    verification_script_sha256: createHash('sha256').update(await readFile('seed/verify-ollama.ts')).digest('hex'),
    platform: `${process.platform}/${process.arch}`, node: process.version, model, model_digest: installed.digest,
    provider: 'real local Ollama; cloud disabled for this recorded run', transport: 'production HttpProvider and Gateway; direct pipeline, not browser E2E',
    scope: 'Unfrozen development smoke and Alwaz slices. Local mode permits external_llm=deny/approval for authorized users. ACL filtering may omit documents rather than emit deny; fixture action mismatches are retained. Stage overhead excludes llm but excludes audit and vault setup outside measured stages. No headline accuracy claim.',
    checks, cases: rows.length, provider_calls: rows.reduce((n, r) => n + Number(r.provider_calls), 0),
    overhead_ms: percentiles('overhead_ms'), wall_ms: percentiles('wall_ms'), rows };
  await mkdir('results/alwaz', { recursive: true });
  await writeFile('results/alwaz/ollama-verification.json', JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`Checks: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length}; report saved.\n`);
  if (Object.values(checks).some(v => !v)) process.exitCode = 1;
} finally { policies?.close(); vault?.close(); await client?.close(); await mongo.stop(); }
