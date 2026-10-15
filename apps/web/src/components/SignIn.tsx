import { useState } from 'react'
import { users } from '../data/demo'
import { reducedMotion } from '../lib/motion'
import { Avatar } from './Sidebar'
import { Icon, Modal, Orb } from './ui'

const how = [
  'Pick a person below. Each one is a demo account with its own role.',
  'LeakShield signs them in with a fresh token, a new chat and their own vault.',
  'Chat as usual. The gateway checks every message against that person’s access.',
]

// "Who is using this?" The only place the signed-in person changes.
export function SignIn({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean
  current: string
  onClose: () => void
  onPick: (id: string) => void
}) {
  // Tick the chosen row first, then hand over, so the choice is felt.
  const [chosen, setChosen] = useState<string | null>(null)
  const choose = (id: string) => {
    if (chosen) return
    if (id === current || reducedMotion()) return onPick(id)
    setChosen(id)
    setTimeout(() => {
      setChosen(null)
      onPick(id)
    }, 420)
  }
  return (
    <Modal open={open} onClose={onClose} label="Sign in">
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div>
          <Orb tone="idle" size={30} />
          <h2 className="mt-4 font-serif text-[30px] leading-tight">Who’s chatting?</h2>
          <p className="mt-1 text-[13.5px] text-faint">Sign in as one of the demo people. No password needed.</p>
        </div>
        <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>

      <ol className="mx-6 mt-5 space-y-2.5 rounded-[14px] bg-surface-2 p-4">
        {how.map((step, i) => (
          <li key={step} className="flex gap-3 text-[13px] leading-snug text-muted">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-medium text-fg">{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <div role="radiogroup" aria-label="Demo people" className="space-y-1 p-3 pt-4">
        {users.map((u, i) => {
          const on = chosen ? u.id === chosen : u.id === current
          return (
            <button
              key={u.id}
              role="radio"
              aria-checked={on}
              data-autofocus={on ? '' : undefined}
              onClick={() => choose(u.id)}
              className={`stg group flex w-full items-center gap-3.5 rounded-[14px] px-3 py-2.5 text-left transition duration-300 ${on ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
              style={{ ['--i' as string]: i }}
            >
              <span className={`transition-transform duration-500 [transition-timing-function:var(--ease-spring)] group-hover:scale-110 ${u.id === chosen ? 'scale-110' : ''}`}>
                <Avatar user={u} index={i} size={38} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{u.name}</span>
                <span className="block text-[12.5px] text-faint">{u.role}</span>
              </span>
              {on ? (
                <span key={u.id} className="pop-in inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
                  <Icon name="check" className="h-4 w-4" />
                  Signed in
                </span>
              ) : (
                <span className="text-[12.5px] text-faint">Sign in</span>
              )}
            </button>
          )
        })}
      </div>
      <p className="border-t border-line-2 px-6 py-4 text-[12px] text-faint">All five are synthetic demo people. Switching starts a new conversation.</p>
    </Modal>
  )
}
