import { ApiError, type Backend } from './client'

export type PostSession = { token: string; backend: Backend }
export type CoverStatus = 'scheduled' | 'active' | 'ended'
export type Cover = {
  id: string; from: string; to: string; groups: string[]
  created_at: string; starts_at: string; expires_at: string; revoked_at: string | null
  status: CoverStatus; active: boolean
}
export type Covering = { id: string; for: string; groups: string[]; until: string }
export type MyPosts = {
  id: string; own_groups: string[]; delegated_groups: string[]; groups: string[]
  lendable_groups: string[]; covering: Covering[]; max_hours: number
}
export type PostList = { given: Cover[]; received: Cover[]; active?: Cover[]; max_hours: number }
export type PostGrant = { to: string; groups: string[]; starts_at?: string } & ({ days: number; hours?: never } | { hours: number; days?: never })

const messages: Record<string, string> = {
  NOTHING_TO_DELEGATE: 'You do not have any posts to assign.',
  GROUP_NOT_DELEGABLE: 'You can only assign posts you hold yourself. Employee, admin and borrowed posts cannot be assigned.',
  DELEGATION_LIMIT: 'You can assign your posts to at most three colleagues at once. Scheduled covers count towards this limit.',
  START_TOO_FAR: 'Choose a start time within the next 14 days.',
  START_IN_PAST: 'Choose Now or a start time in the future.',
  DELEGATE_TO_SELF: 'Choose a colleague other than yourself.',
  DELEGATE_UNKNOWN: 'This colleague could not be found. Choose another colleague.',
  DELEGATION_NOT_FOUND: 'This cover is no longer available, or you do not have permission to end it.',
  INVALID_REQUEST: 'Check the colleague, posts, start time and duration. Choose 1–168 hours or 1–7 days.',
  UNAUTHENTICATED: 'Your session has expired. Sign in again.',
  FORBIDDEN: 'You do not have permission to manage this cover.',
  DELEGATION_UNAVAILABLE: 'Acting posts are not available on this gateway yet. Ask your administrator to enable them.',
}
export function postError(error: unknown): string {
  if (error instanceof ApiError) return messages[error.message] ?? (error.status === 401 ? messages.UNAUTHENTICATED : error.status === 403 ? messages.FORBIDDEN : error.status === 404 || error.status === 501 ? messages.DELEGATION_UNAVAILABLE : 'The gateway could not update acting posts. Please try again.')
  return 'Could not reach acting posts. Check your connection and try again.'
}

async function request<T>(session: PostSession, method: 'GET' | 'POST' | 'DELETE', path: string, body?: PostGrant, signal?: AbortSignal): Promise<T> {
  if (session.backend === 'mock') throw new ApiError('DELEGATION_UNAVAILABLE', 501)
  const response = await fetch(path, {
    method, signal,
    headers: { Authorization: `Bearer ${session.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new ApiError(typeof data.error === 'string' ? data.error : data.error?.code ?? 'UNKNOWN', response.status)
  }
  return response.json()
}
export const getMyPosts = (session: PostSession, signal?: AbortSignal) => request<MyPosts>(session, 'GET', '/api/me', undefined, signal)
export const getPosts = (session: PostSession, signal?: AbortSignal) => request<PostList>(session, 'GET', '/api/delegations', undefined, signal)
export const assignPost = (session: PostSession, grant: PostGrant) => request<Cover>(session, 'POST', '/api/delegations', grant)
export const endPost = (session: PostSession, id: string) => request<Cover>(session, 'DELETE', `/api/delegations/${encodeURIComponent(id)}`)

export const coverStatus = (cover: Cover, now = Date.now()) => cover.revoked_at || Date.parse(cover.expires_at) <= now ? 'ended' : Date.parse(cover.starts_at) > now ? 'scheduled' : 'active'
