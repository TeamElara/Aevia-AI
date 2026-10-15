import { useEffect, useState } from 'react'
import { getStats, subscribeEvents } from '../api/client'
import { actionLabel, type Action, type Stats } from '../api/contract'
import { Chamfer } from '../components/Chamfer'
import { BarList, ColumnChart, StatTile } from '../components/charts'
import { useAdmin } from '../lib/useAdmin'

const WINDOWS = [
  ['15 min', 15],
  ['1 hour', 60],
  ['6 hours', 360],
] as const

export function OverviewView() {
  const { admin, error } = useAdmin()
  const [windowMin, setWindowMin] = useState(60)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  // Refresh on a timer and whenever a new audit event arrives.
  useEffect(() => {
    if (!admin) return
    const t = setInterval(() => setTick((n) => n + 1), 10_000)
    const off = subscribeEvents(admin.backend, admin.token, () => setTick((n) => n + 1))
    return () => {
      clearInterval(t)
      off()
    }
  }, [admin])

  useEffect(() => {
    if (!admin) return
    let cancelled = false
    setLoading(true)
    getStats(admin.backend, admin.token, windowMin)
      .then((s) => !cancelled && setStats(s))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [admin, windowMin, tick])

  const per5 = (stats?.per_5min ?? []).map((b) => ({
    key: b.t,
    label: new Date(b.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    value: b.incidents,
  }))
  const categories = Object.entries(stats?.by_category ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: k, value: v }))
  const actions = (Object.entries(stats?.by_action ?? {}) as [Action, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: actionLabel[k].toLowerCase(), value: v }))

  return (
    <div className="space-y-3">
      {/* Filters scope everything below them. */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <div className="flex gap-1 rounded-full border border-line p-0.5 text-[12px]" role="group" aria-label="Time window">
          {WINDOWS.map(([label, m]) => (
            <button
              key={m}
              onClick={() => setWindowMin(m)}
              aria-pressed={windowMin === m}
              className={`rounded-full px-3 py-1 transition ${windowMin === m ? 'bg-fg text-void' : 'text-muted hover:text-fg'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
          {error ? `error: ${error}` : `policy v${stats?.policy_version ?? '–'}${admin?.backend === 'mock' ? ' · mock data' : ''}`}
        </span>
      </div>

      <div className={`space-y-3 transition-opacity ${loading && stats ? 'opacity-60' : ''}`}>
        <Chamfer>
          <div className="grid grid-cols-2 gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <StatTile hero label="Requests" value={stats ? stats.requests.toLocaleString('en-IN') : '–'} sub={`last ${windowMin} min`} />
            <StatTile label="Blocked" value={stats ? `${stats.blocked_pct}%` : '–'} sub="provider not called" />
            <StatTile label="Masked" value={stats ? `${stats.masked_pct}%` : '–'} sub="values sent as tokens" />
            <StatTile
              label="Gateway overhead"
              value={stats?.overhead_ms_p50 != null ? `${stats.overhead_ms_p50}ms` : '–'}
              sub={stats?.overhead_ms_p95 != null ? `p50 · p95 ${stats.overhead_ms_p95}ms · excl. LLM` : 'p50 · excl. LLM'}
            />
          </div>
        </Chamfer>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
          <Chamfer className="min-w-0">
            <div className="p-6 sm:p-8">
              <h3 className="text-[14px] text-fg">Incidents per 5 minutes</h3>
              <p className="mb-5 text-[12px] text-faint">Any request whose action was not allow</p>
              {per5.length ? (
                <ColumnChart data={per5} label="Incidents per 5 minutes" valueLabel="incidents" />
              ) : (
                <p className="py-12 text-center text-[13px] text-faint">No requests in this window.</p>
              )}
            </div>
          </Chamfer>
          <Chamfer className="min-w-0">
            <div className="space-y-7 p-6 sm:p-8">
              <div>
                <h3 className="mb-4 text-[14px] text-fg">Findings by category</h3>
                <BarList data={categories} label="Findings by category" />
              </div>
              <div>
                <h3 className="mb-4 text-[14px] text-fg">Requests by action</h3>
                <BarList data={actions} label="Requests by action" />
              </div>
            </div>
          </Chamfer>
        </div>
      </div>
    </div>
  )
}
