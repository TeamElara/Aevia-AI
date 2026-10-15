import { users } from '../data/demo'
import type { SecurityKind } from '../api/security'
import type { SecurityWarnings } from '../lib/useSecurityAlerts'
import { Masthead } from '../components/Masthead'

const descriptions: Record<SecurityKind, { title: string; detail: string }> = {
  prompt_manipulation: { title: 'Repeated instruction-manipulation blocks', detail: 'Several user-origin requests matched high-confidence prompt-manipulation rules and were blocked.' },
  access_denied: { title: 'Repeated unavailable-access requests', detail: 'Several explicit document requests could not be authorized. Missing references can also produce this signal.' },
  credential_pasting: { title: 'Repeated credential pasting', detail: 'Several requests containing credentials were blocked. Accidental pasting is possible; start with privacy guidance.' },
}
const levelLabels = ['Manager review', 'Next-level review', 'Security escalation']
export function SecurityAlertsView({ warnings }: { warnings: SecurityWarnings }) {
  return <div className="flex flex-col">
    <Masthead label="Security warnings" title="Repeated risk," muted="human review." count={warnings.unread}>
      Warnings route through the configured reporting hierarchy. They are signals for review, not proof of misconduct.
      No prompt text, document contents or secret values are included. Acknowledging a warning does not change access.
    </Masthead>
    {warnings.data?.can_review_all && <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Warning inbox">
      <button className={`btn btn-sm ${warnings.scope === 'assigned' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={warnings.scope === 'assigned'} onClick={() => warnings.setScope('assigned')}>Assigned to me</button>
      <button className={`btn btn-sm ${warnings.scope === 'oversight' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={warnings.scope === 'oversight'} onClick={() => warnings.setScope('oversight')}>Security oversight</button>
    </div>}
    <div className="mt-6 flex items-center justify-between gap-4">
      <p className="text-[13px] text-faint">Signed-in account only. Your own activity is routed to an independent reviewer.</p>
      <button className="btn btn-ghost btn-sm" onClick={warnings.refresh}>Refresh warnings</button>
    </div>
    {warnings.error && <p role="alert" className="mt-4 rounded-xl border border-line p-4">{warnings.error}</p>}
    {warnings.loading && <p role="status" className="mt-6 text-muted">Loading warnings…</p>}
    {warnings.data && !warnings.data.enabled && <p className="card mt-6 p-6">Security warnings are not enabled for this workspace.</p>}
    {warnings.data?.enabled && warnings.data.alerts.length === 0 && <p className="card mt-6 p-6">No warnings in this inbox.</p>}
    {warnings.data?.truncated && <p className="mt-4 text-[13px] text-faint">Showing the latest 100 warnings.</p>}
    <ul className="mt-6 space-y-4" aria-label="Security warnings">
      {warnings.data?.alerts.map(alert => <li key={alert.id} className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="tag risk">{levelLabels[alert.level - 1] ?? 'Review required'}</span>
          <time className="text-[12px] text-faint" dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleString()}</time>
        </div>
        <h2 className="mt-4 text-[19px] font-medium">{users.find(u => u.id === alert.subject_id)?.name ?? alert.subject_id}: {descriptions[alert.kind].title}</h2>
        <p className="mt-2 text-[14px] text-muted">{descriptions[alert.kind].detail}</p>
        <p className="mt-3 font-mono text-[12px] text-faint">{alert.attempts} attempts in the preceding 15-minute window · level {alert.level}</p>
        <div className="mt-4 flex items-center gap-3">
          {alert.acknowledged_at ? <span className="text-[13px] text-muted">Acknowledged {new Date(alert.acknowledged_at).toLocaleTimeString()}</span>
            : <button className="btn btn-primary btn-sm" disabled={warnings.busy === alert.id} onClick={() => void warnings.acknowledge(alert.id)}>{warnings.busy === alert.id ? 'Acknowledging…' : 'Acknowledge warning'}</button>}
        </div>
      </li>)}
    </ul>
  </div>
}
