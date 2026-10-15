#!/usr/bin/env node
// Runs eval cases through the gateway one at a time and writes the metrics in
// PLAN.md §10. Reports keep ids, actions, booleans and timings only: never a
// prompt, an answer or a captured payload.
//
//   node eval/run.mjs eval/dev.jsonl [more.jsonl] [--gateway URL] [--baseline] [--mock] [--out results]

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { CONTRACT_VERSION, expectation } from './expectations.mjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { isIntervention, judge } from './checks.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const files = args.filter((a, i) => !a.startsWith('--') && !['--gateway', '--out'].includes(args[i - 1]))
const GATEWAY = option('--gateway', process.env.GATEWAY_URL || 'http://localhost:8080')
const OUT = option('--out', 'results')
const BASELINE = flag('--baseline')
const MOCK = flag('--mock')
const MODE = MOCK ? 'mock' : BASELINE ? 'baseline' : 'leakshield'
const INTERVAL = Number(process.env.EVAL_INTERVAL_MS ?? 0)
if (!Number.isFinite(INTERVAL) || INTERVAL < 0 || INTERVAL > 60000) throw new Error('Invalid EVAL_INTERVAL_MS')
let nextChatAt = 0

if (!files.length) {
  console.error('Usage: node eval/run.mjs <cases.jsonl> [...] [--gateway URL] [--baseline] [--mock] [--out dir]')
  process.exit(2)
}
if (MOCK && BASELINE) {
  console.error('--baseline needs a real gateway; the mock has no passthrough mode.')
  process.exit(2)
}

// ---------------------------------------------------------------- transport

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function gatewayPost(path, body, token, extraHeaders = {}) {
  if (path === '/api/chat' && nextChatAt > Date.now()) await sleep(nextChatAt - Date.now())
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GATEWAY + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    })
    // Rate limits and provider hiccups: back off and retry, one request at a time.
    if ((res.status === 429 || res.status === 503) && attempt < 5) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 1000 * 2 ** attempt
      await sleep(wait)
      continue
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `HTTP ${res.status}`)
    }
    const data = await res.json()
    if (path === '/api/chat' && data.provider_calls > 0) nextChatAt = Date.now() + INTERVAL
    return data
  }
}

async function makeClient() {
  if (MOCK) {
    const mock = await import(new URL('../apps/web/src/api/mock.ts', import.meta.url))
    return {
      login: (user) => mock.mockLogin(user).then((r) => r.token),
      // The mock has no capture; its user-turn payload stands in for it.
      chat: async (token, req) => {
        const res = await mock.mockChat(token, req)
        return { ...res, eval: { provider_calls: res.provider_calls, provider_payload: res.sent_to_model } }
      },
    }
  }
  const headers = { 'X-Eval-Capture': '1', ...(BASELINE ? { 'X-LeakShield-Mode': 'passthrough' } : {}) }
  return {
    login: (user) => gatewayPost('/api/auth/login', { user }).then((r) => r.token),
    chat: (token, req) => gatewayPost('/api/chat', req, token, headers),
  }
}

// ---------------------------------------------------------------- run

const tokens = new Map()
async function tokenFor(client, user) {
  if (!tokens.has(user)) tokens.set(user, await client.login(user))
  return tokens.get(user)
}

async function runCase(client, c) {
  const token = await tokenFor(client, c.user)
  let conversation_id = null
  for (const turn of c.history ?? []) {
    const r = await client.chat(token, { conversation_id, message: turn })
    conversation_id = r.conversation_id
  }
  // Keep optional quota pacing outside the measured final-request wall time.
  if (!MOCK && nextChatAt > Date.now()) await sleep(nextChatAt - Date.now())
  const started = performance.now()
  const res = await client.chat(token, { conversation_id, message: c.prompt, attached_doc: c.attached_doc ?? undefined })
  const wall = performance.now() - started

  return {
    id: c.id,
    split: c.split,
    category: c.category,
    user: c.user,
    source_id: c.source_id,
    mutation: c.mutation,
    expected_action: c.expected_action,
    ...judge(c, res, providerMode),
    wall_ms: Math.round(wall),
  }
}

// ---------------------------------------------------------------- metrics

const pct = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}
const ratio = (a, b) => (b ? +(a / b).toFixed(3) : null)

function summarise(rows) {
  const ok = rows.filter((r) => !r.error)
  const tp = ok.filter((r) => r.expected_intervention && r.observed_intervention).length
  const fn = ok.filter((r) => r.expected_intervention && !r.observed_intervention).length
  const fp = ok.filter((r) => !r.expected_intervention && r.observed_intervention).length
  const allowed = rows.filter((r) => !isIntervention(r.expected_action)).length
  const captured = ok.filter((r) => r.provider_leak !== null)

  const byCategory = {}
  for (const r of rows) {
    const b = (byCategory[r.category] ??= { n: 0, correct: 0, errors: 0 })
    b.n++
    if (r.correct) b.correct++
    if (r.error) b.errors++
  }

  return {
    cases: rows.length,
    errors: rows.length - ok.length,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    false_positives_on_allowed: `${fp} / ${allowed}`,
    correct_action_rate: ratio(ok.filter((r) => r.correct).length, rows.length),
    blocked_but_called: ok.filter((r) => r.blocked_but_called).length,
    provider_leaks: captured.length ? captured.filter((r) => r.provider_leak).length : 'not captured (EVAL_MODE off?)',
    user_leaks: ok.filter((r) => r.user_leak).length,
    overhead_ms_p50: pct(ok.map((r) => r.overhead_ms), 50),
    overhead_ms_p95: pct(ok.map((r) => r.overhead_ms), 95),
    wall_ms_p50: pct(ok.map((r) => r.wall_ms), 50),
    wall_ms_p95: pct(ok.map((r) => r.wall_ms), 95),
    by_category: byCategory,
  }
}

// Recall on mutated cases ÷ recall on the held-out cases they came from.
function retention(allRows) {
  const source = new Map(allRows.filter((r) => r.split === 'heldout').map((r) => [r.id, r]))
  const mutated = allRows.filter((r) => r.split === 'robustness' && source.has(r.source_id) && r.expected_intervention)
  if (!mutated.length) return null
  const recall = (rs) => ratio(rs.filter((r) => r.observed_intervention).length, rs.length)
  const sourcesOf = (rs) => [...new Set(rs.map((r) => r.source_id))].map((id) => source.get(id))
  const base = recall(sourcesOf(mutated))
  // Each mutation is compared with its own source cases (paraphrases may use different sources).
  const byMutation = {}
  for (const m of [...new Set(mutated.map((r) => r.mutation))]) {
    const rs = mutated.filter((r) => r.mutation === m)
    const rm = recall(rs)
    const rb = recall(sourcesOf(rs))
    byMutation[m] = { source_recall: rb, recall: rm, retention: rb ? ratio(rm, rb) : null }
  }
  const rMut = recall(mutated)
  return { source_recall: base, mutated_recall: rMut, retention: base ? ratio(rMut, base) : null, by_mutation: byMutation }
}

function markdown(name, summary, rows, ret) {
  const lines = [
    `# Eval: ${name} (${MODE})`,
    '',
    `Development run; not a coordinated evaluation freeze. Overhead is measured stages excluding model time, not total security overhead.`,
    '',
    `Run at ${new Date().toISOString()} against ${MOCK ? 'the built-in mock (runner self-test only)' : GATEWAY}.`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    ...Object.entries(summary)
      .filter(([k]) => k !== 'by_category')
      .map(([k, v]) => `| ${k.replace(/_/g, ' ')} | ${v ?? 'n/a'} |`),
    '',
    '## By category',
    '',
    '| Category | Cases | Correct | Errors |',
    '| --- | --- | --- | --- |',
    ...Object.entries(summary.by_category).map(([k, b]) => `| ${k} | ${b.n} | ${b.correct} | ${b.errors} |`),
    '',
  ]
  if (ret) {
    lines.push(
      '## Robustness retention',
      '',
      `Source recall ${ret.source_recall}, mutated recall ${ret.mutated_recall}, retention **${ret.retention}**.`,
      '',
      '| Mutation | Source recall | Mutated recall | Retention |',
      '| --- | --- | --- | --- |',
      ...Object.entries(ret.by_mutation).map(([m, v]) => `| ${m} | ${v.source_recall} | ${v.recall} | ${v.retention} |`),
      '',
    )
  }
  const misses = rows.filter((r) => !r.correct)
  lines.push('## Misses', '')
  if (!misses.length) lines.push('None.', '')
  else {
    lines.push('| Case | Category | Expected | Observed | Note |', '| --- | --- | --- | --- | --- |')
    for (const r of misses) {
      const note = r.error ? `error: ${r.error}` : r.blocked_but_called ? 'blocked after calling the provider' : ''
      lines.push(`| ${r.id} | ${r.category} | ${r.expected_action} | ${r.observed_action ?? '-'} | ${note} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------- main

// Record the actual target configuration, never infer provider mode from labels.
const health = MOCK ? { provider_mode: 'mock', provider_external: true, model: 'mock' }
  : await fetch(GATEWAY + '/api/health').then(r => { if (!r.ok) throw new Error('Gateway health unavailable'); return r.json() })
if (!MOCK && typeof health.provider_external !== 'boolean') throw new Error('Gateway must advertise provider_external for contract scoring')
if (BASELINE && !health.baseline_available) throw new Error('Explicit offline baseline is not configured')
const providerMode = health.provider_external ? 'external' : 'local'
const provenance = {
  contract: CONTRACT_VERSION, provider_mode: providerMode, provider_evidence: health.provider_mode ?? 'unverified', model: health.model,
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source_dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  frozen: false,
  overhead_definition: 'Sum of instrumented stages excluding llm (case insensitive); excludes audit/vault work outside stages. Wall time includes HTTP and model time. Not total security overhead.',
}
const client = await makeClient()
mkdirSync(OUT, { recursive: true })
const allRows = []

for (const file of files) {
  const cases = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
  console.log(`\n${file}: ${cases.length} case(s), mode ${MODE}`)

  const rows = []
  for (const c of cases) {
    let row
    try {
      row = await runCase(client, c)
    } catch (e) {
      row = { id: c.id, split: c.split, category: c.category, original_expected_action: c.expected_action, expected_action: expectation(c, providerMode).action, source_id: c.source_id, mutation: c.mutation, expected_intervention: isIntervention(expectation(c, providerMode).action), observed_intervention: false, correct: false, error: 'REQUEST_FAILED' }
    }
    rows.push(row)
    const mark = row.error ? 'ERR' : row.correct ? 'ok ' : 'MISS'
    const leak = row.provider_leak ? ' PROVIDER-LEAK' : ''
    console.log(`  ${mark} ${c.id.padEnd(6)} ${c.expected_action.padEnd(16)} → ${(row.observed_action ?? row.error).padEnd(16)} calls ${row.provider_calls ?? '-'}${leak}`)
  }
  allRows.push(...rows)

  const name = basename(file, '.jsonl')
  const summary = summarise(rows)
  const ret = rows.some((r) => r.split === 'robustness') ? retention(allRows) : null
  const report = { file, provenance: { ...provenance, dataset_sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }, mode: MODE, gateway: MOCK ? 'mock' : GATEWAY, at: new Date().toISOString(), summary, retention: ret, cases: rows }
  writeFileSync(join(OUT, `${name}-${MODE}.json`), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(OUT, `${name}-${MODE}.md`), markdown(name, summary, rows, ret))

  const { by_category, ...headline } = summary
  console.log(headline)
  if (ret) console.log('robustness', ret)
}
console.log(`\nReports in ${OUT}/`)
