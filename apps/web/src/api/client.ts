import type { ChatRequest, ChatResponse, LoginResponse } from './contract'
import { mockChat, mockLogin } from './mock'

// VITE_API_MODE: "live" = gateway only, "mock" = mock only,
// "auto" (default) = gateway, falling back to the mock if it is not running.
const MODE = (import.meta.env.VITE_API_MODE ?? 'auto') as 'auto' | 'live' | 'mock'

export type Backend = 'live' | 'mock'

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
async function gatewayUp(): Promise<boolean> {
  try {
    const res = await fetch('/api/health')
    return res.ok
  } catch {
    return false
  }
}

export async function login(user: string): Promise<LoginResponse & { backend: Backend }> {
  if (MODE === 'mock' || (MODE === 'auto' && !(await gatewayUp()))) {
    return { ...(await mockLogin(user)), backend: 'mock' }
  }
  return { ...(await post<LoginResponse>('/api/auth/login', { user })), backend: 'live' }
}

export function chat(backend: Backend, token: string, req: ChatRequest): Promise<ChatResponse> {
  return backend === 'mock' ? mockChat(token, req) : post<ChatResponse>('/api/chat', req, token)
}
