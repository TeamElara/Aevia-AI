import { useEffect, useState } from 'react'
import { getStats, subscribeEvents } from '../api/client'
import { actionLabel, type Action, type Stats } from '../api/contract'
import { Masthead } from '../components/Masthead'
import { BarList, ColumnChart, StatTile } from '../components/charts'
import { Segmented } from '../components/ui'
import { ms } from '../lib/format'
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
  const [statsError, setStatsError] = useState<string | null>(null)
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
      .then((s) => { if (!cancelled) { setStats(s); setStatsError(null) } })
      .catch(() => { if (!cancelled) setStatsError('Statistics unavailable. Check the gateway connection.') })
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
    <div className="flex flex-col">
      {/* Filters scope everything below them. */}
      <Masthead label="Overview" title="What the gateway stopped." muted={`Last ${windowMin} minutes.`}>
        Requests through the gateway, what it blocked or masked, and what that cost in time.
        <span className="mt-1 block text-[13px] text-faint">
          {error ? `Error: ${error}` : `Policy v${stats?.policy_version ?? '–'}${admin?.backend === 'mock' ? ' · mock data' : ''}`}
        </span>
      </Masthead>
      <div className="stg mt-8" style={{ ['--i' as string]: 4 }}>
        <Segmented label="Time window" value={windowMin} onChange={setWindowMin} options={WINDOWS} />
      </div>

      {statsError && <p role="alert" className="mt-6 text-[13px] text-muted">{statsError}</p>}

      <div className={`stg mt-6 flex flex-col gap-4 transition-opacity ${loading && stats ? 'opacity-60' : ''}`} style={{ ['--i' as string]: 5 }}>
        <section>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile tile label="Requests" value={stats ? stats.requests.toLocaleString('en-IN') : '–'} sub="through the gateway" />
            <StatTile tile label="Blocked" value={stats ? `${stats.blocked_pct}%` : '–'} sub="provider not called" />
            <StatTile tile label="Masked" value={stats ? `${stats.masked_pct}%` : '–'} sub="values sent as tokens" />
            <StatTile
              tile
              label="Gateway overhead"
              value={ms(stats?.overhead_ms_p50)}
              sub={stats?.overhead_ms_p95 != null ? `p50 · p95 ${ms(stats.overhead_ms_p95)} · excl. LLM` : 'p50 · excl. LLM'}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
          <section className="card min-w-0">
            <div className="px-5 py-6 sm:p-7">
              <h3 className="display text-[22px] text-fg">Incidents per 5 minutes.</h3>
              <p className="mb-6 mt-1 text-[13px] text-faint">Any request whose action was not allow</p>
              {per5.length ? (
                <ColumnChart data={per5} label="Incidents per 5 minutes" valueLabel="incidents" />
              ) : (
                <p className="py-12 text-center text-[13px] text-faint">No requests in this window.</p>
              )}
            </div>
          </section>
          <section className="card min-w-0">
            <div className="space-y-8 px-5 py-6 sm:p-7">
              <div>
                <h3 className="display mb-4 text-[22px] text-fg">Findings by category.</h3>
                <BarList data={categories} label="Findings by category" />
              </div>
              <div>
                <h3 className="display mb-4 text-[22px] text-fg">Requests by action.</h3>
                <BarList data={actions} label="Requests by action" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
