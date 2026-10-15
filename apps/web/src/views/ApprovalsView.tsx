import { useCallback, useEffect, useState } from 'react'
import { decideApproval, listApprovals } from '../api/client'
import type { Approval } from '../api/contract'
import { Chamfer } from '../components/Chamfer'
import { useAdmin } from '../lib/useAdmin'

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const countdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ApprovalsView() {
  const { admin, error } = useAdmin()
  const [items, setItems] = useState<Approval[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const now = useNow()

  const refresh = useCallback(() => {
    if (admin) listApprovals(admin.backend, admin.token).then(setItems).catch((e) => setNotice((e as Error).message))
  }, [admin])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh])

  async function decide(a: Approval, decision: 'approve' | 'reject') {
    if (!admin) return
    setBusy(a.approval_id)
    setNotice(null)
    try {
      const updated = await decideApproval(admin.backend, admin.token, a.approval_id, decision, a.request_hash)
      setItems((xs) => xs.map((x) => (x.approval_id === updated.approval_id ? updated : x)))
      setNotice(
        decision === 'approve'
          ? 'Approved. The gateway re-checked policy and ACL against the request hash and replayed it.'
          : 'Rejected. The held request was deleted from memory.',
      )
    } catch (e) {
      setNotice((e as Error).message)
      refresh()
    } finally {
      setBusy(null)
    }
  }

  const pending = items.filter((a) => a.status === 'pending' && Date.parse(a.expires_at) > now)
  const past = items.filter((a) => !pending.includes(a))

  return (
    <Chamfer className="min-w-0">
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-6 py-4 sm:px-8">
          <h2 className="text-[15px] text-fg">Approvals</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            {error ? `error: ${error}` : `${pending.length} pending${admin?.backend === 'mock' ? ' · mock' : admin?.backend === 'simulated' ? ' · simulated provider' : ''}`}
          </span>
        </div>

        <div className="space-y-6 px-6 py-6 sm:px-8">
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-muted">
            Requests that would send a confidential document to the external model wait here for up to 10 minutes. The request
            itself is held encrypted in gateway memory; this list shows metadata only.
          </p>

          {notice && <p className="rounded-[4px] border border-line px-4 py-3 text-[13px] text-fg" role="status">{notice}</p>}

          {pending.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-line px-6 py-10 text-center">
              <p className="text-[14px] text-muted">Nothing waiting for approval.</p>
              <p className="mt-1 text-[12px] text-faint">
                To create one, sign in as Meera in Chat and ask: “Summarise the Project Garuda roadmap”.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {pending.map((a) => {
                const left = Date.parse(a.expires_at) - now
                const total = Date.parse(a.expires_at) - Date.parse(a.created_at)
                return (
                  <li key={a.approval_id} className="rounded-[6px] border border-line-strong p-5">
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-[14px] text-fg">{a.reason}</p>
                        <p className="font-mono text-[11px] text-muted">
                          {a.user_pseudo} · docs {a.doc_ids.join(', ')}
                        </p>
                        <p className="truncate font-mono text-[11px] text-faint" title={a.request_hash}>
                          {a.request_hash}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[22px] leading-none tabular-nums text-fg">{countdown(left)}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">until expiry</p>
                      </div>
                    </div>
                    <div className="mt-4 h-px w-full bg-line">
                      <div className="h-px bg-fg transition-[width] duration-1000" style={{ width: `${(left / total) * 100}%` }} />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        disabled={busy === a.approval_id}
                        onClick={() => decide(a, 'approve')}
                        className="rounded-full bg-fg px-4 py-1.5 text-[13px] text-void transition hover:bg-white disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        disabled={busy === a.approval_id}
                        onClick={() => decide(a, 'reject')}
                        className="rounded-full border border-line-strong px-4 py-1.5 text-[13px] text-muted transition hover:border-fg hover:text-fg disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {past.length > 0 && (
            <div>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">History</h3>
              <ul className="divide-y divide-white/[0.05]">
                {past.map((a) => (
                  <li key={a.approval_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[13px]">
                    <span className="font-mono text-[11px] text-muted">{new Date(a.created_at).toLocaleTimeString('en-GB')}</span>
                    <span className="font-mono text-[11px] text-muted">{a.user_pseudo}</span>
                    <span className="text-muted">{a.doc_ids.join(', ')}</span>
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-fg">
                      {a.status === 'pending' ? 'expired' : a.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Chamfer>
  )
}
