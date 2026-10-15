import type { Approval, AuditEvent, ChatRequest, ChatResponse, LoginResponse, Stats } from './contract'
import { mockApprovals, mockChat, mockDecide, mockLogin, mockStats, mockSubscribe } from './mock'

// VITE_API_MODE: "live" = gateway only, "mock" = mock only,
// "auto" (default) = gateway, falling back to the mock if it is not running.
const MODE = (import.meta.env.VITE_API_MODE ?? 'auto') as 'auto' | 'live' | 'mock'

export type Backend = 'live' | 'mock'

export class ApiError extends Error {}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(data.error ?? `Gateway returned ${res.status}`)
  }
  return res.json()
}

// The Vite proxy answers 5xx when nothing is listening on the gateway port.
let backendProbe: Promise<Backend> | null = null
export function detectBackend(): Promise<Backend> {
  if (MODE !== 'auto') return Promise.resolve(MODE)
  backendProbe ??= fetch('/api/health')
    .then((r) => (r.ok ? 'live' : 'mock') as Backend)
    .catch(() => 'mock' as Backend)
  return backendProbe
}

export async function login(user: string): Promise<LoginResponse & { backend: Backend }> {
  const backend = await detectBackend()
  if (backend === 'mock') return { ...(await mockLogin(user)), backend }
  return { ...(await request<LoginResponse>('POST', '/api/auth/login', { user })), backend }
}

export function chat(
  backend: Backend,
  token: string,
  req: ChatRequest,
  opts: { evalCapture?: boolean } = {},
): Promise<ChatResponse> {
  if (backend === 'mock') {
    return mockChat(token, req).then((r) =>
      opts.evalCapture ? { ...r, eval: { provider_calls: r.provider_calls, provider_payload: r.sent_to_model } } : r,
    )
  }
  return request<ChatResponse>('POST', '/api/chat', req, token, opts.evalCapture ? { 'X-Eval-Capture': '1' } : {})
}

// ------------------------------------------------------------- dashboards (admin)

export function subscribeEvents(
  backend: Backend,
  token: string,
  onEvent: (e: AuditEvent) => void,
  onStatus: (s: 'open' | 'error') => void = () => {},
): () => void {
  if (backend === 'mock') {
    onStatus('open')
    return mockSubscribe(onEvent)
  }
  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
  es.onopen = () => onStatus('open')
  es.onerror = () => onStatus('error')
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data))
    } catch {
      /* ignore malformed frames */
    }
  }
  return () => es.close()
}

export function getStats(backend: Backend, token: string, windowMinutes = 60): Promise<Stats> {
  if (backend === 'mock') return Promise.resolve(mockStats(windowMinutes))
  return request<Stats>('GET', `/api/stats?window=${windowMinutes}`, undefined, token)
}

export function listApprovals(backend: Backend, token: string): Promise<Approval[]> {
  if (backend === 'mock') return mockApprovals()
  return request<Approval[]>('GET', '/api/approvals', undefined, token)
}

export function decideApproval(backend: Backend, token: string, id: string, decision: 'approve' | 'reject'): Promise<Approval> {
  if (backend === 'mock') return mockDecide(id, decision)
  return request<Approval>('POST', `/api/approvals/${encodeURIComponent(id)}/${decision}`, {}, token)
}
