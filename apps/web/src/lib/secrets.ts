// Client-side "Replace with [SECRET_…] and send". The gateway never returns
// the matched value or its offsets, so the user's own browser finds the
// secret in the user's own text and swaps it for a placeholder before resend.

const PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bsk-(?:live|test|proj)?[-_A-Za-z0-9]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  /\bxox[bpas]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/gi, // DB URI with password: keep scheme and host
  /\b(password|passwd|pwd|secret|token)\s*[:=]\s*["']?[^\s"']{4,}/gi,
]

const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const tag = () => `[SECRET_${Array.from({ length: 4 }, () => B32[Math.floor(Math.random() * B32.length)]).join('')}]`

export function replaceSecrets(text: string): string {
  let out = text
  for (const re of PATTERNS) {
    out = out.replace(re, (m, key) => {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(m)) return m.replace(/:\/\/[^\s:@/]+:[^\s@/]+@/, `://${tag()}@`)
      if (typeof key === 'string' && /^(password|passwd|pwd|secret|token)$/i.test(key)) return `${key}=${tag()}`
      return tag()
    })
  }
  return out
}
