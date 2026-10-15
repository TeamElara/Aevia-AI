import type { ChatRequest, ChatResponse, LoginResponse } from './contract'
import { mockChat, mockLogin } from './mock'

// VITE_API_MODE: "live" = gateway only, "mock" = mock only,
// "auto" (default) = gateway, falling back to the mock if it is not running.
const MODE = (import.meta.env.VITE_API_MODE ?? 'auto') as 'auto' | 'live' | 'mock' | 'simulated'

export type Backend = 'live' | 'mock' | 'simulated'

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(data.error ?? `Gateway returned ${res.status}`)
  }
  return res.json()
}

// The Vite proxy answers 5xx when nothing is listening on the gateway port.
async function gatewayBackend(): Promise<Backend | null> {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) return null
    const health = await res.json()
    return health.provider_mode === 'simulated' ? 'simulated' : 'live'
  } catch { return null }
}

export async function login(user: string): Promise<LoginResponse & { backend: Backend }> {
  const backend = MODE === 'mock' ? null : await gatewayBackend()
  if (MODE === 'mock' || (MODE === 'auto' && !backend)) {
    return { ...(await mockLogin(user)), backend: 'mock' }
  }
  return { ...(await post<LoginResponse>('/api/auth/login', { user })), backend: backend ?? 'live' }
}

export function chat(backend: Backend, token: string, req: ChatRequest): Promise<ChatResponse> {
  return backend === 'mock' ? mockChat(token, req) : post<ChatResponse>('/api/chat', req, token)
}

export interface PendingApproval { id: string; request_hash: string; expires_at: string }
export async function listApprovals(token: string): Promise<PendingApproval[]> {
  const res = await fetch('/api/approvals', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new ApiError('Approvals are unavailable for this account.')
  return res.json()
}
export async function decideApproval(token: string, approval: PendingApproval, decision: 'approve' | 'reject') {
  return post(`/api/approvals/${encodeURIComponent(approval.id)}/${decision}`, { request_hash: approval.request_hash }, token)
}
export async function pollApprovalResult(token: string, requestId: string, conversationId: string): Promise<ChatResponse | null> {
  const res = await fetch(`/api/access/results/${encodeURIComponent(requestId)}?conversation_id=${encodeURIComponent(conversationId)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 202) return null
  if (!res.ok) throw new ApiError('Approval result is unavailable or expired.')
  return res.json()
}
