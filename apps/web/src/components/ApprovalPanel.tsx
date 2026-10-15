import { useEffect, useState } from 'react'
import { decidePendingApproval, listPendingApprovals, type Backend, type PendingApproval } from '../api/client'
import { users } from '../data/demo'
import { Chamfer } from './Chamfer'

export function ApprovalPanel({ token, backend, activeUser, onPickUser }: { token?: string; backend?: Backend; activeUser: string; onPickUser: (id: string) => void }) {
  const [pending, setPending] = useState<PendingApproval[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      if (!token || activeUser !== 'admin' || backend === 'mock') return
      try { const rows = await listPendingApprovals(token); if (!cancelled) { setPending(rows); setError('') } }
      catch { if (!cancelled) setError('The approval queue is unavailable.') }
    }
    const timer = setInterval(() => { setNow(Date.now()); void refresh() }, 2000)
    void refresh()
    return () => { cancelled = true; clearInterval(timer) }
  }, [token, activeUser, backend])
  async function decide(approval: PendingApproval, decision: 'approve' | 'reject') {
    if (!token) return
    setBusy(approval.id)
    try {
      await decidePendingApproval(token, approval, decision)
      setPending(rows => rows.filter(row => row.id !== approval.id))
    } catch { setError('The request expired, changed, or could not be completed. Refresh before retrying.') }
    finally { setBusy(null) }
  }
  return <Chamfer className="min-h-[60vh] p-6 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl">Approvals</h1>
      <label className="text-sm text-muted">Demo user <select aria-label="Approval demo user" value={activeUser} onChange={e => onPickUser(e.target.value)} className="ml-2 border border-line bg-void px-3 py-2">
        {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select></label>
    </div>
    <p className="mt-3 max-w-2xl text-sm text-muted">Review metadata only. Approval rechecks current access and policy. The answer returns to the requesting user’s chat.</p>
    {activeUser !== 'admin' ? <p className="mt-8 text-muted">An admin can review pending requests. Open a separate tab as Admin to keep the requester’s chat available.</p>
      : backend === 'mock' ? <p className="mt-8 text-muted">Start the gateway to use the approval queue.</p>
      : <div className="mt-8 space-y-4" aria-live="polite">
        {pending.length === 0 && <p className="text-muted">No pending requests.</p>}
        {pending.map(approval => {
          const remaining = Math.max(0, Math.ceil((Date.parse(approval.expires_at) - now) / 1000))
          return <div key={approval.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4">
            <div><p className="break-all font-mono text-xs">{approval.id}</p><p className="mt-2 text-sm text-muted">Expires in {remaining}s</p></div>
            <div className="flex gap-3"><button disabled={!!busy || remaining === 0} onClick={() => void decide(approval, 'approve')} className="border border-line px-4 py-2 text-sm disabled:opacity-40">Approve</button>
              <button disabled={!!busy || remaining === 0} onClick={() => void decide(approval, 'reject')} className="border border-line px-4 py-2 text-sm disabled:opacity-40">Reject</button></div>
          </div>
        })}
      </div>}
    {error && <p role="alert" className="mt-6 text-sm">{error}</p>}
  </Chamfer>
}
