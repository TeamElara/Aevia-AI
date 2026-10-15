import { users } from '../data/demo'
import { initials, ms } from '../lib/format'

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
    <div className="w-full max-w-[340px] animate-float [transform-style:preserve-3d]">
      <div className="overflow-hidden rounded-[6px] border border-line-strong bg-gradient-to-b from-[#151515] to-[#070707] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2a2a2a] font-mono text-[10px] text-fg">
            {initials(user.name)}
          </span>
          <div className="leading-tight">
            <p className="text-[13px] text-fg">{user.name}</p>
            <p className="text-[11px] text-faint">
              {user.role}
              {exchange.tag && <span className="ml-1.5 font-mono uppercase tracking-wider">· {exchange.tag}</span>}
            </p>
          </div>
          <ActionBadge label={exchange.label} stop={exchange.stop} className="ml-auto" />
        </div>

        <div className="space-y-4 px-4 py-5">
          <Field label="User typed" text={exchange.typed} />
          <Field label="Sent to model" text={exchange.sent} strong />
          <Field label="User sees" text={exchange.reply} />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-4 py-3 font-mono text-[10px] text-faint">
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
    </div>
  )
}

export function ActionBadge({ label, stop, className = '' }: { label: string; stop: boolean; className?: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider ${
        stop ? 'border-fg bg-fg text-void' : 'border-line-strong text-fg'
      } ${className}`}
    >
      {label}
    </span>
  )
}

function Field({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{label}</p>
      <p
        className={`mt-1 line-clamp-4 break-words font-mono text-[12.5px] leading-relaxed ${strong ? 'text-fg' : 'text-muted'}`}
      >
        {text}
      </p>
    </div>
  )
}
