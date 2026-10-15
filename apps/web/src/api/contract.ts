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
  attached_doc?: string | null
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
  // Only with EVAL_MODE=1 and X-Eval-Capture: 1 (docs/API.md, Eval mode).
  eval?: { provider_external?: boolean; provider_calls: number; provider_payload: string | null }
}

// Audit allowlist (PLAN.md §8). No prompt text, no values, no doc titles.
export interface AuditEvent {
  request_id: string
  ts: string
  user_pseudo: string
  conversation_pseudo: string
  stage: string
  categories: string[]
  counts: Record<string, number>
  rule_ids: string[]
  policy_version: string | number
  action: Action
  model_called: boolean
  via: ('raw' | 'normalised' | 'decoded')[]
  stage_ms: Record<string, number>
  total_ms: number
}

export interface Stats {
  window_minutes: number
  requests: number
  blocked_pct: number
  masked_pct: number
  by_category: Record<string, number>
  by_action: Partial<Record<Action, number>>
  per_5min: { t: string; incidents: number }[]
  overhead_ms_p50: number | null
  overhead_ms_p95: number | null
  policy_version: string | number
}

export interface Approval {
  approval_id: string
  request_hash: string
  user_pseudo: string
  doc_ids: string[]
  reason: string
  status: 'pending' | 'replaying' | 'approved' | 'rejected' | 'expired' | 'failed'
  created_at: string
  expires_at: string
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

// The gateway may send an empty answer when nothing came back from the model.
const STOPPED_TEXT: Partial<Record<Action, string>> = {
  block: 'Nothing was sent to the model.',
  block_response: 'The response was withheld.',
  deny: 'No documents you can access matched.',
  require_approval: 'Waiting for admin approval.',
}
export const answerText = (r: Pick<ChatResponse, 'answer' | 'action'>) => r.answer || STOPPED_TEXT[r.action] || ''

// Actions that stopped the request or the answer; drawn inverted.
export const isStop = (a: Action) => a === 'block' || a === 'block_response' || a === 'deny'
