import { useCallback, useEffect, useState } from 'react'
import { acknowledgeSecurityAlert, getSecurityAlerts, type SecurityInbox, type SecurityScope, type SecuritySession } from '../api/security'

type Snapshot = { key: string; data: SecurityInbox | null; error: string | null; busy: string | null }
export function useSecurityAlerts(session: SecuritySession | null) {
  const token = session?.token ?? '', backend = session?.backend
  const [selection, setSelection] = useState<{ token: string; scope: SecurityScope }>({ token: '', scope: 'assigned' })
  const scope = selection.token === token ? selection.scope : 'assigned'
  const key = `${token}:${scope}`
  const [snapshot, setSnapshot] = useState<Snapshot>({ key: '', data: null, error: null, busy: null })
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    if (!token || !backend) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const data = await getSecurityAlerts({ token, backend }, scope, controller.signal)
        if (controller.signal.aborted) return
        setSnapshot(previous => ({ key, data, error: null, busy: previous.key === key ? previous.busy : null }))
        if (data.enabled) timer = setTimeout(load, 15_000)
      } catch (error) {
        if (controller.signal.aborted) return
        setSnapshot({ key, data: null, error: (error as Error).message, busy: null })
        timer = setTimeout(load, 15_000)
      }
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [token, backend, scope, key, version])
  useEffect(() => { window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [refresh])
  const current = snapshot.key === key ? snapshot : { key, data: null, error: null, busy: null }
  const acknowledge = async (id: string) => {
    if (!session) return
    const owner = key
    setSnapshot(previous => previous.key === owner ? { ...previous, busy: id, error: null } : previous)
    try {
      const result = await acknowledgeSecurityAlert(session, id)
      setSnapshot(previous => previous.key !== owner ? previous : { ...previous, data: previous.data ? {
        ...previous.data, alerts: previous.data.alerts.map(a => a.id === id ? { ...a, acknowledged_at: result.acknowledged_at } : a),
      } : null })
    } catch (error) {
      setSnapshot(previous => previous.key === owner ? { ...previous, error: (error as Error).message } : previous)
    } finally { setSnapshot(previous => previous.key === owner ? { ...previous, busy: null } : previous) }
  }
  return { ...current, loading: !!token && snapshot.key !== key, scope, refresh, acknowledge,
    setScope: (next: SecurityScope) => setSelection({ token, scope: next }),
    unread: current.data?.alerts.filter(a => !a.acknowledged_at).length ?? 0 }
}
export type SecurityWarnings = ReturnType<typeof useSecurityAlerts>
