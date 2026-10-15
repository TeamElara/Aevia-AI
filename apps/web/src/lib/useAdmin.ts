import { useEffect, useState } from 'react'
import { login, type Backend } from '../api/client'

// Dashboards (Incidents, Overview, Approvals) always act as the seeded admin,
// whoever is selected in the chat. Admin can see incidents but no documents.
export function useAdmin() {
  const [admin, setAdmin] = useState<{ token: string; backend: Backend } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    login('admin')
      .then((r) => !cancelled && setAdmin({ token: r.token, backend: r.backend }))
      .catch((e) => !cancelled && setError((e as Error).message))
    return () => {
      cancelled = true
    }
  }, [])
  return { admin, error }
}
