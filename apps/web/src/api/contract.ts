// Mirrors docs/API.md. Change both together.

export type Action =
  | 'allow'
  | 'warn'
  | 'mask'
  | 'redact'
  | 'quarantine'
  | 'deny'
  | 'require_approval'
  | 'block'
  | 'block_response'

export interface FindingSummary {
  category: string
  source: 'prompt' | 'history' | 'document' | 'response'
  via: 'raw' | 'normalised' | 'decoded'
  ruleId: string
}

export interface SessionUser {
  id: string
  name: string
  role: string
  groups: string[]
}

export interface LoginResponse {
  token: string
  user: SessionUser
}

export interface ChatRequest {
  conversation_id: string | null
  message: string
}

export interface ChatResponse {
  request_id: string
  conversation_id: string
  answer: string
  action: Action
  reason: string | null
  rule_ids: string[]
  findings: FindingSummary[]
  stage_ms: Record<string, number>
  sent_to_model: string | null
  provider_calls: number
  citations: { doc_id: string; title: string }[]
  approval_id?: string
}

export const actionLabel: Record<Action, string> = {
  allow: 'ALLOWED',
  warn: 'WARNED',
  mask: 'MASKED',
  redact: 'REDACTED',
  quarantine: 'QUARANTINED',
  deny: 'DENIED',
  require_approval: 'PENDING APPROVAL',
  block: 'BLOCKED',
  block_response: 'WITHHELD',
}

// Actions that stopped the request or the answer; drawn inverted.
export const isStop = (a: Action) => a === 'block' || a === 'block_response' || a === 'deny'
