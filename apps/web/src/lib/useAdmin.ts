import { useEffect, useState } from 'react'
import { login, type Backend } from '../api/client'

type Admin = { token: string; backend: Backend }
// One admin sign-in shared by every dashboard, reused for 50 minutes (tokens last an hour).
// Signing in again on every view switch used up the gateway's login limit.
let shared: { at: number; session: Promise<Admin> } | null = null
function adminSession(): Promise<Admin> {
  if (shared && Date.now() - shared.at < 50 * 60_000) return shared.session
  const session = login('admin').then((r) => ({ token: r.token, backend: r.backend }))
  shared = { at: Date.now(), session }
  session.catch(() => { if (shared?.session === session) shared = null })
  return session
}

// Dashboards (Incidents, Overview, Approvals) always act as the seeded admin,
// whoever is selected in the chat. Admin can see incidents but no documents.
export function useAdmin() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    adminSession()
      .then((a) => !cancelled && setAdmin(a))
      .catch((e) => !cancelled && setError((e as Error).message))
    return () => {
      cancelled = true
    }
  }, [])
  return { admin, error }
}
