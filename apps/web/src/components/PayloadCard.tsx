import { users } from '../data/demo'
import { initials, ms } from '../lib/format'
import { toneOfLabel, toneVar } from '../lib/tone'
import { Tokens } from './ui'

// One prompt/answer pair as the card shows it: what the user typed, what the
// provider received, and what the user got back.
export type Exchange = {
  user: string
  label: string
  stop: boolean
  typed: string
  sent: string
  reply: string
  providerCalls: number
  stages: [string, number][]
  tag?: string
}

export function PayloadCard({ exchange }: { exchange: Exchange }) {
  const user = users.find((u) => u.id === exchange.user) ?? users[0]
  return (
    <div className="card w-full overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-[11px] font-medium text-muted">
          {initials(user.name)}
        </span>
        <div className="leading-tight">
          <p className="text-[14px] font-medium">{user.name}</p>
          <p className="text-[12px] text-faint">
            {user.role}
            {exchange.tag && <span className="ml-1.5 text-accent">· {exchange.tag}</span>}
          </p>
        </div>
        <ActionBadge label={exchange.label} stop={exchange.stop} className="ml-auto" />
      </div>

      <div className="space-y-4 border-t border-line-2 px-5 py-5">
        <Field label="User typed" text={exchange.typed} i={0} />
        <Field label="Sent to model" text={exchange.sent} strong i={1} />
        <Field label="User sees" text={exchange.reply} i={2} />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line-2 bg-paper/60 px-5 py-3 font-mono text-[10.5px] text-faint">
        {exchange.stages.map(([name, t]) => (
          <span key={name}>
            {name} <span className="text-muted">{ms(t)}</span>
          </span>
        ))}
        <span className="ml-auto">
          provider calls <span className="text-fg">{exchange.providerCalls}</span>
        </span>
      </div>
    </div>
  )
}

export function ActionBadge({ label, stop, className = '' }: { label: string; stop: boolean; className?: string }) {
  return (
    <span className={`tag ${className}`} style={{ ['--c' as string]: toneVar[toneOfLabel(label, stop)] }}>
      {label.charAt(0) + label.slice(1).toLowerCase()}
    </span>
  )
}

function Field({ label, text, strong, i }: { label: string; text: string; strong?: boolean; i: number }) {
  return (
    <div
      className={`stg ${strong ? '-mx-3 rounded-[12px] bg-accent-soft px-3 py-2.5' : ''}`}
      style={{ ['--i' as string]: i + 1 }}
    >
      <p className="label">{label}</p>
      <p
        className={`mt-1.5 line-clamp-4 break-words font-mono text-[12.5px] leading-relaxed ${strong ? 'text-fg' : 'text-muted'}`}
      >
        <Tokens text={text} />
      </p>
    </div>
  )
}
