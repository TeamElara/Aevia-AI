import type { Approval, AuditEvent, ChatRequest, ChatResponse, LoginResponse, Stats } from './contract'
import { mockApprovals, mockChat, mockDecide, mockLogin, mockStats, mockSubscribe } from './mock'

// VITE_API_MODE: "live" = gateway only, "mock" = mock only,
// "auto" (default) = gateway, falling back to the mock if it is not running.
const MODE = (import.meta.env.VITE_API_MODE ?? 'auto') as 'auto' | 'live' | 'mock'

export type Backend = 'live' | 'mock' | 'simulated'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

// The gateway sends `{ error: "CODE" }` on /api routes and `{ error: { code, message } }` elsewhere.
const errorText = (e: unknown, status: number) =>
  typeof e === 'string' ? e : (e as { message?: string; code?: string })?.message ?? (e as { code?: string })?.code ?? `Gateway returned ${status}`

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
    throw new ApiError(errorText(data.error, res.status), res.status)
  }
  return res.json()
}

// The Vite proxy answers 5xx when nothing is listening on the gateway port.
let backendProbe: Promise<Backend> | null = null
export function detectBackend(): Promise<Backend> {
  if (MODE === 'mock') return Promise.resolve('mock')
  backendProbe ??= fetch('/api/health')
    .then(async r => r.ok ? ((await r.json()).provider_mode === 'simulated' ? 'simulated' : 'live') as Backend : MODE === 'live' ? 'live' : 'mock')
    .catch(() => (MODE === 'live' ? 'live' : 'mock') as Backend)
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
  // Header authentication keeps admin JWTs out of request URLs and proxy access logs.
  const controller = new AbortController()
  const { signal } = controller
  void (async () => {
    while (!signal.aborted) {
      try {
        const res = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal })
        if (!res.ok || !res.body) { onStatus('error'); if (res.status === 401 || res.status === 403) return; throw new Error('Stream unavailable') }
        onStatus('open')
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        try {
          while (!signal.aborted) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
            if (buffer.length > 1_000_000) throw new Error('Stream frame too large')
            let end: number
            while ((end = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, end)
              buffer = buffer.slice(end + 2)
              const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
              if (data) { try { onEvent(JSON.parse(data)) } catch { /* ignore malformed frames */ } }
            }
          }
        } finally { await reader.cancel().catch(() => {}) }
      } catch { if (signal.aborted) return }
      if (signal.aborted) return
      onStatus('error')
      await new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
        const timer = setTimeout(finish, 2000)
        signal.addEventListener('abort', finish, { once: true })
      })
    }
  })()
  return () => controller.abort()
}

export function getStats(backend: Backend, token: string, windowMinutes = 60): Promise<Stats> {
  if (backend === 'mock') return Promise.resolve(mockStats(windowMinutes))
  return request<Stats>('GET', `/api/stats?window=${windowMinutes}`, undefined, token)
}

export function listApprovals(backend: Backend, token: string): Promise<Approval[]> {
  if (backend === 'mock') return mockApprovals()
  return request<Approval[]>('GET', '/api/approvals', undefined, token)
}

export function decideApproval(backend: Backend, token: string, id: string, decision: 'approve' | 'reject', requestHash?: string): Promise<Approval> {
  if (backend === 'mock') return mockDecide(id, decision)
  return request<Approval>('POST', `/api/approvals/${encodeURIComponent(id)}/${decision}`, { request_hash: requestHash }, token)
}

export async function pollApprovalResult(token: string, requestId: string, conversationId: string): Promise<ChatResponse | null> {
  const res = await fetch(`/api/access/results/${encodeURIComponent(requestId)}?conversation_id=${encodeURIComponent(conversationId)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 202) return null
  if (!res.ok) throw new ApiError('Approval result is unavailable or expired.')
  return res.json()
}
