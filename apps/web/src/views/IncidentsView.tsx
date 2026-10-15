import { useEffect, useState } from 'react'
import { subscribeEvents } from '../api/client'
import { actionLabel, isStop, type AuditEvent } from '../api/contract'
import { Masthead } from '../components/Masthead'
import { ActionBadge } from '../components/PayloadCard'
import { Segmented } from '../components/ui'
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
    <div className="flex flex-col">
      <Masthead label="Incidents" title="Every stop, as it happens." muted="Metadata only." count={rows.length}>
        Every request the gateway stopped or changed, as it happens. Metadata only: pseudonymous user ids, categories and
        rule ids. No prompt text or values are ever stored or shown.
      </Masthead>
      <div className="stg mt-10 flex flex-wrap items-center gap-x-4 gap-y-3" style={{ ['--i' as string]: 4 }}>
        <Segmented
          label="Filter"
          value={incidentsOnly}
          onChange={setIncidentsOnly}
          options={[
            ['Incidents', true],
            ['All requests', false],
          ]}
        />
        <span className="flex items-center gap-2 text-[13px] text-faint">
          <span className="live-dot" style={status === 'open' ? undefined : { background: 'var(--color-faint)', animation: 'none' }} />
          {error ? `error: ${error}` : status === 'open' ? `streaming${admin?.backend === 'mock' ? ' · mock' : ''}` : status}
        </span>
      </div>
      <section className="card stg mt-5 min-w-0 overflow-hidden" style={{ ['--i' as string]: 5 }}>
        <div className="overflow-x-auto px-2 py-1">
          <table className="tbl min-w-[600px]">
            <thead>
              <tr>
                {['Time', 'User', 'Stage', 'Categories', 'Rule', 'Action', 'Via', 'Total'].map((h) => (
                  <th
                    key={h}
                    className={`${h === 'Total' ? 'text-right' : ''} ${
                      h === 'Via' || h === 'Total' || h === 'Stage' ? 'hidden lg:table-cell' : ''
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="!py-12 text-center text-faint">
                    {status === 'open' ? 'No incidents yet. Try a prompt in Chat.' : 'Connecting…'}
                  </td>
                </tr>
              )}
              {rows.map((e) => (
                <tr
                  key={e.request_id}
                  className={fresh.has(e.request_id) ? 'fresh' : undefined}
                >
                  <td className="font-mono text-[11px] text-muted tabular-nums">
                    {new Date(e.ts).toLocaleTimeString('en-GB')}
                  </td>
                  <td className="font-mono text-[11px] text-muted" title={e.user_pseudo}>
                    {shortId(e.user_pseudo)}
                  </td>
                  <td className="hidden text-muted lg:table-cell">{e.stage}</td>
                  <td className="text-fg">{e.categories.join(', ') || '—'}</td>
                  <td className="max-w-[170px] truncate font-mono text-[11px] text-muted" title={e.rule_ids.join(', ')}>
                    {e.rule_ids[0] ?? '—'}
                    {e.rule_ids.length > 1 && <span className="text-faint"> +{e.rule_ids.length - 1}</span>}
                  </td>
                  <td>
                    <ActionBadge label={actionLabel[e.action]} stop={isStop(e.action)} />
                  </td>
                  <td className="hidden font-mono text-[11px] text-muted lg:table-cell">{e.via.join(', ') || '—'}</td>
                  <td className="hidden text-right font-mono text-[11px] text-muted tabular-nums lg:table-cell">{ms(e.total_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
