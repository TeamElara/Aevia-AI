// A stand-in gateway so the console works before apps/gateway exists.
// It imitates the response shape only. Its detection is a rough sketch and is
// never used for eval numbers; the UI marks every mock reply as MOCK.

import type { Action, Approval, AuditEvent, ChatRequest, ChatResponse, LoginResponse, SessionUser, Stats } from './contract'

const people: Record<string, SessionUser> = {
  asha: { id: 'asha', name: 'Asha Rao', role: 'Employee', groups: ['employee'] },
  ravi: { id: 'ravi', name: 'Ravi Menon', role: 'HR', groups: ['employee', 'hr'] },
  meera: { id: 'meera', name: 'Meera Iyer', role: 'Engineering', groups: ['employee', 'engineering'] },
  ceo: { id: 'ceo', name: 'CEO', role: 'Executive', groups: ['employee', 'exec'] },
  admin: { id: 'admin', name: 'Admin', role: 'Dashboard only', groups: ['admin'] },
}

const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]]
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]
const verhoeff = (s: string) => [...s].reverse().reduce((c, ch, i) => D[c][P[i % 8][+ch]], 0) === 0

const SECRET = /AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36}|-----BEGIN [A-Z ]*PRIVATE KEY-----/
const INJECTION =
  /\b(ignore|forget|disregard)\b.{0,40}\b(instructions|system prompt|rules)\b|\b(bhool jao|bhul jao)\b|system prompt (dikhao|batao)|developer mode|###\s*system:|reproduce the configuration/i
const RESTRICTED = /\b(salary bands?|board minutes|employee master)\b/i
const AADHAAR = /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g
const PAN = /\b[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]\b/g
const AADHAAR_CONTEXT = /\b(aadhaar|aadhar|uid)\b|आधार/i

const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const vaults = new Map<string, Map<string, string>>() // conversation -> value -> token
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const id = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`

function tokenFor(conv: string, category: string, value: string) {
  let vault = vaults.get(conv)
  if (!vault) vaults.set(conv, (vault = new Map()))
  let token = vault.get(value)
  if (!token) {
    const tail = Array.from({ length: 4 }, () => B32[Math.floor(Math.random() * B32.length)]).join('')
    token = `[${category}_${tail}]`
    vault.set(value, token)
  }
  return token
}

export async function mockLogin(user: string): Promise<LoginResponse> {
  await sleep(120)
  return { token: `mock.${user}`, user: people[user] ?? people.asha }
}

export async function mockChat(token: string, req: ChatRequest): Promise<ChatResponse> {
  const userId = token.replace('mock.', '')
  const res = await respond(userId, req.conversation_id ?? id('conv'), req.message)
  emit(toEvent(userId, res))
  return res
}

async function respond(userId: string, conv: string, text: string): Promise<ChatResponse> {
  const base = { request_id: id('req'), conversation_id: conv, citations: [] as ChatResponse['citations'] }

  await sleep(250)

  if (SECRET.test(text)) {
    return {
      ...base,
      answer: 'Remove the secret and retry. Nothing was sent to the model.',
      action: 'block',
      reason: 'Credential detected in the prompt',
      rule_ids: ['secret.aws_access_key'],
      findings: [{ category: 'SECRET', source: 'prompt', via: 'raw', ruleId: 'secret.aws_access_key' }],
      stage_ms: { PII: 2, Secret: 1 },
      sent_to_model: null,
      provider_calls: 0,
    }
  }

  if (INJECTION.test(text)) {
    return {
      ...base,
      answer: 'This request looks like an attempt to override the assistant’s instructions, so it was not sent.',
      action: 'block',
      reason: 'Prompt injection score 0.93',
      rule_ids: ['inject.intent_x_target'],
      findings: [{ category: 'INJECTION', source: 'prompt', via: 'normalised', ruleId: 'inject.intent_x_target' }],
      stage_ms: { PII: 2, Inject: 38 },
      sent_to_model: null,
      provider_calls: 0,
    }
  }

  if (/\bgaruda\b/i.test(text)) {
    if (!people[userId]?.groups.includes('engineering')) {
      return {
        ...base,
        answer: 'No documents you can access matched.',
        action: 'deny',
        reason: 'Retrieval filtered by access control',
        rule_ids: ['acl.retrieval_filter'],
        findings: [{ category: 'ACL', source: 'document', via: 'raw', ruleId: 'acl.retrieval_filter' }],
        stage_ms: { PII: 2, Inject: 35, ACL: 2 },
        sent_to_model: null,
        provider_calls: 0,
      }
    }
    const approval = createApproval(userId, ['garuda-roadmap'])
    return {
      ...base,
      answer: 'This uses a confidential document. Your request is waiting for admin approval.',
      action: 'require_approval',
      reason: 'Confidential document requires approval for external LLM',
      rule_ids: ['policy.external_llm.approval'],
      findings: [{ category: 'CONFIDENTIAL', source: 'document', via: 'raw', ruleId: 'policy.external_llm.approval' }],
      stage_ms: { PII: 2, Inject: 36, ACL: 2, Outbound: 3 },
      sent_to_model: null,
      provider_calls: 0,
      approval_id: approval.approval_id,
    }
  }

  if (RESTRICTED.test(text) && !people[userId]?.groups.includes('hr')) {
    return {
      ...base,
      answer: 'No documents you can access matched.',
      action: 'deny',
      reason: 'Retrieval filtered by access control',
      rule_ids: ['acl.retrieval_filter'],
      findings: [{ category: 'ACL', source: 'document', via: 'raw', ruleId: 'acl.retrieval_filter' }],
      stage_ms: { PII: 2, Inject: 35, ACL: 2 },
      sent_to_model: null,
      provider_calls: 0,
    }
  }

  const findings: ChatResponse['findings'] = []
  const rules = new Set<string>()
  let sent = text.replace(AADHAAR, (m) => {
    const grouped = /^\d{4}[ -]\d{4}[ -]\d{4}$/.test(m)
    if (!verhoeff(m.replace(/\D/g, '')) || !(grouped || AADHAAR_CONTEXT.test(text))) return m
    findings.push({ category: 'AADHAAR', source: 'prompt', via: 'raw', ruleId: 'pii.aadhaar.verhoeff_ctx' })
    rules.add('pii.aadhaar.verhoeff_ctx')
    return tokenFor(conv, 'AADHAAR', m)
  })
  sent = sent.replace(PAN, (m) => {
    findings.push({ category: 'PAN', source: 'prompt', via: 'raw', ruleId: 'pii.pan' })
    rules.add('pii.pan')
    return tokenFor(conv, 'PAN', m)
  })

  await sleep(450)

  // The "model" answers in tokens; the gateway restores this user's values.
  const modelReply = findings.length
    ? `Draft ready. I referred to the customer’s details as given: ${sent}`
    : `Here is a response to: “${text}”. (Mock model: connect apps/gateway for real answers.)`
  let answer = modelReply
  for (const [value, token] of vaults.get(conv) ?? []) answer = answer.split(token).join(value)

  return {
    ...base,
    answer,
    action: findings.length ? 'mask' : 'allow',
    reason: findings.length ? `${findings.length} value(s) masked before sending` : null,
    rule_ids: [...rules],
    findings,
    stage_ms: { PII: 3, Inject: 40, ACL: 2, LLM: 610, Out: 4 },
    sent_to_model: sent,
    provider_calls: 1,
  }
}

// ------------------------------------------------------------- dashboard mock
// Audit events from this browser's own mock chats, on top of a seeded hour of
// synthetic history so the charts are not empty. Same allowlisted shape the
// gateway sends: no prompt text, no values.

const events: AuditEvent[] = []
const listeners = new Set<(e: AuditEvent) => void>()
const approvals: Approval[] = []

function pseudo(s: string, prefix: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return `${prefix}_${(h >>> 0).toString(16).padStart(8, '0')}`
}

const STAGE: Partial<Record<Action, string>> = {
  block: 'inspect',
  deny: 'retrieve',
  quarantine: 'chunks',
  require_approval: 'outbound',
  block_response: 'response',
  redact: 'response',
}

function toEvent(userId: string, r: ChatResponse): AuditEvent {
  const counts: Record<string, number> = {}
  for (const f of r.findings) counts[f.category] = (counts[f.category] ?? 0) + 1
  return {
    request_id: r.request_id,
    ts: new Date().toISOString(),
    user_pseudo: pseudo(userId, 'u'),
    conversation_pseudo: pseudo(r.conversation_id, 'c'),
    stage: STAGE[r.action] ?? 'release',
    categories: Object.keys(counts),
    counts,
    rule_ids: r.rule_ids,
    policy_version: 1,
    action: r.action,
    model_called: r.provider_calls > 0,
    via: [...new Set(r.findings.map((f) => f.via))],
    stage_ms: r.stage_ms,
    total_ms: Object.values(r.stage_ms).reduce((a, b) => a + b, 0),
  }
}

function emit(e: AuditEvent) {
  events.push(e)
  for (const fn of listeners) fn(e)
}

;(function seedHistory() {
  let s = 7
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const shapes: [Action, string[], string, Record<string, number>][] = [
    ['allow', [], 'release', { PII: 3, Inject: 40, ACL: 2, LLM: 600, Out: 4 }],
    ['allow', [], 'release', { PII: 2, Inject: 38, ACL: 2, LLM: 640, Out: 3 }],
    ['mask', ['AADHAAR', 'PAN'], 'release', { PII: 4, Inject: 41, ACL: 2, LLM: 620, Out: 4 }],
    ['mask', ['PHONE'], 'release', { PII: 3, Inject: 39, ACL: 2, LLM: 590, Out: 4 }],
    ['block', ['SECRET'], 'inspect', { PII: 2, Secret: 1 }],
    ['block', ['INJECTION'], 'inspect', { PII: 2, Inject: 44 }],
    ['deny', ['ACL'], 'retrieve', { PII: 2, Inject: 35, ACL: 2 }],
    ['quarantine', ['INJECTION'], 'chunks', { PII: 3, Inject: 40, ACL: 2, Chunks: 5, LLM: 580, Out: 3 }],
    ['warn', ['AADHAAR'], 'release', { PII: 3, Inject: 40, ACL: 2, LLM: 610, Out: 4 }],
  ]
  const users = Object.keys(people).filter((u) => u !== 'admin')
  const now = Date.now()
  for (let i = 0; i < 70; i++) {
    const [action, cats, stage, stage_ms] = shapes[Math.floor(rand() * shapes.length)]
    const user = users[Math.floor(rand() * users.length)]
    const counts = Object.fromEntries(cats.map((c) => [c, 1]))
    events.push({
      request_id: `req_seed${i}`,
      ts: new Date(now - (60 - (i * 60) / 70) * 60_000 - rand() * 30_000).toISOString(),
      user_pseudo: pseudo(user, 'u'),
      conversation_pseudo: pseudo(`${user}${i % 9}`, 'c'),
      stage,
      categories: cats,
      counts,
      rule_ids: cats.map((c) => `seed.${c.toLowerCase()}`),
      policy_version: 1,
      action,
      model_called: !['block', 'deny'].includes(action),
      via: cats.includes('INJECTION') && rand() < 0.4 ? ['normalised'] : ['raw'],
      stage_ms,
      total_ms: Object.values(stage_ms).reduce((a, b) => a + b, 0),
    })
  }
})()

export function mockSubscribe(fn: (e: AuditEvent) => void) {
  for (const e of events.slice(-50)) fn(e)
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function mockStats(windowMinutes = 60): Stats {
  const since = Date.now() - windowMinutes * 60_000
  const inWindow = events.filter((e) => Date.parse(e.ts) >= since)
  const byAction: Stats['by_action'] = {}
  const byCategory: Record<string, number> = {}
  for (const e of inWindow) {
    byAction[e.action] = (byAction[e.action] ?? 0) + 1
    for (const [c, n] of Object.entries(e.counts)) byCategory[c] = (byCategory[c] ?? 0) + n
  }
  const bucket = 5 * 60_000
  const first = Math.floor(since / bucket) * bucket
  const per5: Stats['per_5min'] = []
  for (let t = first; t <= Date.now(); t += bucket) {
    per5.push({
      t: new Date(t).toISOString(),
      incidents: inWindow.filter((e) => e.action !== 'allow' && Date.parse(e.ts) >= t && Date.parse(e.ts) < t + bucket).length,
    })
  }
  const overhead = inWindow
    .map((e) => Object.entries(e.stage_ms).reduce((s, [k, v]) => (k === 'LLM' ? s : s + v), 0))
    .sort((a, b) => a - b)
  const p = (q: number) => (overhead.length ? overhead[Math.min(overhead.length - 1, Math.ceil(q * overhead.length) - 1)] : null)
  const share = (n: number) => (inWindow.length ? Math.round((n / inWindow.length) * 1000) / 10 : 0)
  return {
    window_minutes: windowMinutes,
    requests: inWindow.length,
    blocked_pct: share((byAction.block ?? 0) + (byAction.block_response ?? 0)),
    masked_pct: share(byAction.mask ?? 0),
    by_category: byCategory,
    by_action: byAction,
    per_5min: per5,
    overhead_ms_p50: p(0.5),
    overhead_ms_p95: p(0.95),
    policy_version: 1,
  }
}

function createApproval(userId: string, docIds: string[]): Approval {
  const now = Date.now()
  const a: Approval = {
    approval_id: id('apr'),
    request_hash: `sha256:${pseudo(`${userId}${now}`, 'h').slice(2)}${pseudo(String(now), 'h').slice(2)}`,
    user_pseudo: pseudo(userId, 'u'),
    doc_ids: docIds,
    reason: 'Confidential document requires approval for external LLM',
    status: 'pending',
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 10 * 60_000).toISOString(),
  }
  approvals.unshift(a)
  return a
}

export async function mockApprovals(): Promise<Approval[]> {
  const now = Date.now()
  for (const a of approvals) if (a.status === 'pending' && Date.parse(a.expires_at) < now) a.status = 'expired'
  return approvals.map((a) => ({ ...a }))
}

export async function mockDecide(approvalId: string, decision: 'approve' | 'reject'): Promise<Approval> {
  await sleep(200)
  const a = approvals.find((x) => x.approval_id === approvalId)
  if (!a) throw new Error('Approval not found')
  if (a.status !== 'pending') throw new Error(`Approval is already ${a.status}`)
  a.status = decision === 'approve' ? 'approved' : 'rejected'
  emit({
    request_id: id('req'),
    ts: new Date().toISOString(),
    user_pseudo: a.user_pseudo,
    conversation_pseudo: pseudo(a.approval_id, 'c'),
    stage: 'approval',
    categories: ['CONFIDENTIAL'],
    counts: { CONFIDENTIAL: 1 },
    rule_ids: ['policy.external_llm.approval'],
    policy_version: 1,
    action: decision === 'approve' ? 'allow' : 'block',
    model_called: decision === 'approve',
    via: ['raw'],
    stage_ms: decision === 'approve' ? { Recheck: 3, LLM: 640, Out: 4 } : { Recheck: 1 },
    total_ms: decision === 'approve' ? 647 : 1,
  })
  return { ...a }
}
