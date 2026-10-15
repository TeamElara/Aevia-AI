import type { Backend } from '../api/client'

export const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const pad2 = (n: number) => String(n).padStart(2, '0')

// Gateway timings arrive as raw floats (e.g. 3.0911669); show 1 decimal under 10ms.
export const ms = (n: number | null | undefined) =>
  n == null ? '–' : `${n < 10 ? Math.round(n * 10) / 10 : Math.round(n)}ms`

// Pseudonymous ids are long HMAC hex strings; the head is enough to tell users apart.
export const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 10)}…` : id)

export const backendLabel: Record<Backend, string> = { live: 'live gateway', simulated: 'simulated provider', mock: 'mock gateway' }
