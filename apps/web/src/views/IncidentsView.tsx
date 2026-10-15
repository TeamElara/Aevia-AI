import { useEffect, useState } from 'react'
import { subscribeEvents } from '../api/client'
import { actionLabel, isStop, type AuditEvent } from '../api/contract'
import { Masthead } from '../components/Masthead'
import { ActionBadge } from '../components/PayloadCard'
import { ms, shortId } from '../lib/format'
import { useAdmin } from '../lib/useAdmin'

const MAX_ROWS = 200

export function IncidentsView() {
  const { admin, error } = useAdmin()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [status, setStatus] = useState<'connecting' | 'open' | 'error'>('connecting')
  const [incidentsOnly, setIncidentsOnly] = useState(true)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!admin) return
    setEvents([])
    let replaying = true
    const off = subscribeEvents(
      admin.backend,
      admin.token,
      (e) => {
        setEvents((prev) => [e, ...prev.filter((p) => p.request_id !== e.request_id)].slice(0, MAX_ROWS))
        if (!replaying) {
          setFresh((f) => new Set(f).add(e.request_id))
          setTimeout(() => setFresh((f) => {
            const n = new Set(f)
            n.delete(e.request_id)
            return n
          }), 2500)
        }
      },
      (s) => setStatus(s),
    )
    replaying = false
    return off
  }, [admin])

  const rows = events
    .filter((e) => !incidentsOnly || e.action !== 'allow')
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))

  return (
    <div className="flex flex-col gap-3">
      <Masthead title="Incidents" count={rows.length}>
        Every request the gateway stopped or changed, as it happens. Metadata only: pseudonymous user ids, categories and
        rule ids. No prompt text or values are ever stored or shown.
      </Masthead>
      <section className="sheet min-w-0">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-4 sm:px-8">
          <h2 className="text-[15px] font-medium tracking-[-0.01em] text-fg">Live stream</h2>
          <span className="text-[12px] text-faint">
            <span className={status === 'open' ? 'text-fg' : ''}>●</span>{' '}
            {error ? `error: ${error}` : status === 'open' ? `streaming${admin?.backend === 'mock' ? ' · mock' : ''}` : status}
          </span>
          <div className="ml-auto flex gap-1 rounded-full border border-line-strong p-0.5 text-[12px]" role="group" aria-label="Filter">
            {[
              ['Incidents', true],
              ['All requests', false],
            ].map(([label, value]) => (
              <button
                key={String(label)}
                onClick={() => setIncidentsOnly(value as boolean)}
                aria-pressed={incidentsOnly === value}
                className={`rounded-full px-3 py-1 transition ${incidentsOnly === value ? 'bg-fg text-void' : 'text-muted hover:text-fg'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto px-5 pb-6 pt-2 sm:px-8">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead>
              <tr className="text-[11px] text-faint">
                {['Time', 'User', 'Stage', 'Categories', 'Rule', 'Action', 'Via', 'Total'].map((h) => (
                  <th
                    key={h}
                    className={`border-b border-line py-2.5 pr-4 font-normal ${h === 'Total' ? 'text-right' : ''} ${
                      h === 'Via' || h === 'Total' || h === 'Stage' ? 'hidden lg:table-cell' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-faint">
                    {status === 'open' ? 'No incidents yet. Try a prompt in Chat.' : 'Connecting…'}
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr
                  key={e.request_id}
                  className={`border-b border-line transition-colors duration-[2000ms] ${fresh.has(e.request_id) ? 'bg-fg/[0.07]' : ''}`}
                >
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-muted tabular-nums">
                    {new Date(e.ts).toLocaleTimeString('en-GB')}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-muted" title={e.user_pseudo}>
                    {shortId(e.user_pseudo)}
                  </td>
                  <td className="hidden py-2.5 pr-4 text-muted lg:table-cell">{e.stage}</td>
                  <td className="py-2.5 pr-4 text-fg">{e.categories.join(', ') || '—'}</td>
                  <td className="max-w-[170px] truncate py-2.5 pr-4 font-mono text-[11px] text-muted" title={e.rule_ids.join(', ')}>
                    {e.rule_ids[0] ?? '—'}
                    {e.rule_ids.length > 1 && <span className="text-faint"> +{e.rule_ids.length - 1}</span>}
                  </td>
                  <td className="py-2.5 pr-4">
                    <ActionBadge label={actionLabel[e.action]} stop={isStop(e.action)} />
                  </td>
                  <td className="hidden py-2.5 pr-4 font-mono text-[11px] text-muted lg:table-cell">{e.via.join(', ') || '—'}</td>
                  <td className="hidden py-2.5 text-right font-mono text-[11px] text-muted tabular-nums lg:table-cell">{ms(e.total_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
