// A stand-in gateway so the console works before apps/gateway exists.
// It imitates the response shape only. Its detection is a rough sketch and is
// never used for eval numbers; the UI marks every mock reply as MOCK.

import type { ChatRequest, ChatResponse, LoginResponse, SessionUser } from './contract'

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
  const conv = req.conversation_id ?? id('conv')
  const text = req.message
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
