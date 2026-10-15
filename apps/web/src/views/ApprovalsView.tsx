import { useCallback, useEffect, useState } from 'react'
import { ApiError, decideApproval, listApprovals } from '../api/client'
import type { Approval } from '../api/contract'
import { Masthead } from '../components/Masthead'
import { Arrow } from '../components/ui'
import { useAdmin } from '../lib/useAdmin'
import { useActingPosts } from '../lib/useActingPosts'
import { CoverList } from '../components/ActingPosts'

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
  const posts = useActingPosts(admin)
  const [items, setItems] = useState<Approval[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const now = useNow()

  const refresh = useCallback(() => {
    if (admin) listApprovals(admin.backend, admin.token)
        .then(setItems)
        .catch((e) =>
          setNotice(
            e instanceof ApiError && e.status === 404
              ? 'The approval backend is not connected to this gateway yet, so approval-required requests stay withheld.'
              : (e as Error).message,
          ),
        )
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
    <div className="flex flex-col">
      <Masthead label="Approvals" title="Held for a person." muted="Nothing leaves until you say so." count={pending.length}>
        Requests that would send a confidential document to the external model wait here for up to 10 minutes. The request
        itself is held encrypted in gateway memory; this list shows metadata only.
        <span className="mt-1 block text-[13px] text-faint">
          {error ? `Error: ${error}` : `${pending.length} pending${admin?.backend === 'mock' ? ' · mock' : admin?.backend === 'simulated' ? ' · simulated provider' : ''}`}
        </span>
      </Masthead>
      <section className="stg mt-10 min-w-0" style={{ ['--i' as string]: 4 }}>
        <div className="space-y-6">

          {notice && (
            <p className="animate-msg rounded-r-[10px] border-l-2 border-accent bg-surface px-4 py-3 text-[13.5px] text-muted" role="status">
              {notice}
            </p>
          )}

          {pending.length === 0 ? (
            <div className="flex items-center gap-[18px] rounded-[16px] border border-dashed border-line px-[22px] py-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-faint" aria-hidden="true">
                ✓
              </span>
              <div>
              <p className="font-medium text-fg">Nothing waiting for approval.</p>
              <p className="mt-0.5 text-[13px] text-faint">
                To create one, sign in as Meera in Chat and ask: “Summarise the Project Garuda roadmap”.
              </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {pending.map((a) => {
                const left = Date.parse(a.expires_at) - now
                const total = Date.parse(a.expires_at) - Date.parse(a.created_at)
                return (
                  <li key={a.approval_id} className="card animate-row p-5 shadow-[inset_3px_0_0_var(--color-accent),var(--shadow)] sm:p-6">
                    <span className="tag risk mb-4">Pending approval</span>
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-[16px] font-medium text-fg">{a.reason}</p>
                        <p className="font-mono text-[11px] text-muted">
                          {a.user_pseudo} · docs {a.doc_ids.join(', ')}
                        </p>
                        <p className="truncate font-mono text-[11px] text-faint" title={a.request_hash}>
                          {a.request_hash}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="display text-[40px] tabular-nums text-fg">{countdown(left)}</p>
                        <p className="mt-2 text-[11px] text-faint">until expiry</p>
                      </div>
                    </div>
                    <div className="mt-4 h-px w-full bg-line">
                      <div className="h-px bg-accent transition-[width] duration-1000" style={{ width: `${(left / total) * 100}%` }} />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        disabled={busy === a.approval_id}
                        onClick={() => decide(a, 'approve')}
                        className="btn btn-primary btn-sm"
                      >
                        Approve
                        <Arrow />
                      </button>
                      <button
                        disabled={busy === a.approval_id}
                        onClick={() => decide(a, 'reject')}
                        className="btn btn-ghost btn-sm"
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
              <h3 className="label mb-3">History</h3>
              <ul className="divide-y divide-line border-t border-line">
                {past.map((a) => (
                  <li key={a.approval_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[13px]">
                    <span className="font-mono text-[11px] text-muted">{new Date(a.created_at).toLocaleTimeString('en-GB')}</span>
                    <span className="font-mono text-[11px] text-muted">{a.user_pseudo}</span>
                    <span className="text-muted">{a.doc_ids.join(', ')}</span>
                    <span className="ml-auto text-[12px] capitalize text-fg">
                      {a.status === 'pending' ? 'expired' : a.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      <section className="mt-10 min-w-0" aria-label="Acting posts">
        <h2 className="font-display text-[24px] font-medium">Acting posts</h2>
        <p className="post-meta mt-1">Current and scheduled covers. Ending a cover removes its access on the next request.</p>
        {posts.error && <p className="post-error mt-3" role="alert">{posts.error} <button className="underline" onClick={posts.refresh}>Retry</button></p>}
        {posts.loading ? <p className="post-meta mt-3" role="status">Loading acting posts…</p> : posts.list?.active?.length ? <CoverList covers={posts.list.active} posts={posts} admin /> : !posts.error && <p className="post-meta mt-3">No active or scheduled covers.</p>}
      </section>
    </div>
  )
}
