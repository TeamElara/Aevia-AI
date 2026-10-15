import type { Backend } from './client'

export type SecurityScope = 'assigned' | 'oversight'
export type SecurityKind = 'prompt_manipulation' | 'access_denied' | 'credential_pasting'
export interface SecurityAlert {
  id: string; subject_id: string; kind: SecurityKind; level: number; attempts: number;
  created_at: string; window_start: string; window_end: string; acknowledged_at: string | null
}
export interface SecurityInbox { enabled: boolean; can_review_all: boolean; scope: SecurityScope; alerts: SecurityAlert[]; truncated?: boolean }
export type SecuritySession = { token: string; backend: Backend }
const disabled: SecurityInbox = { enabled: false, can_review_all: false, scope: 'assigned', alerts: [] }

export async function getSecurityAlerts(session: SecuritySession, scope: SecurityScope, signal?: AbortSignal): Promise<SecurityInbox> {
  if (session.backend === 'mock') return disabled
  const response = await fetch(`/api/security/alerts?scope=${scope}`, { headers: { Authorization: `Bearer ${session.token}` }, signal })
  if (response.status === 404) return disabled // Older gateways have no warnings feature.
  if (!response.ok) throw new Error(response.status === 403 ? 'You do not have permission to review this inbox.' : 'Security warnings are temporarily unavailable. Try again.')
  return response.json()
}
export async function acknowledgeSecurityAlert(session: SecuritySession, id: string) {
  if (session.backend === 'mock') throw new Error('This inbox requires a connected gateway.')
  const response = await fetch(`/api/security/alerts/${encodeURIComponent(id)}/ack`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!response.ok) throw new Error('This warning changed or you do not have permission to acknowledge it. Refresh the inbox.')
  return response.json() as Promise<{ id: string; acknowledged_at: string }>
}
