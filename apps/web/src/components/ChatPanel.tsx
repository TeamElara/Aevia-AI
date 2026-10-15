import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Backend } from '../api/client'
import { actionLabel, answerText, isStop, type ChatResponse } from '../api/contract'
import { starters, type DemoUser } from '../data/demo'
import { replaceSecrets } from '../lib/secrets'
import { toneOf, type Tone } from '../lib/tone'
import { ActionBadge } from './PayloadCard'
import { reducedMotion } from '../lib/motion'
import { Arrow, Icon, Magnetic, Orb, Reveal, Tokens } from './ui'
import { GatewayLens } from './GatewayLens'

export type Turn = {
  id: string
  prompt: string
  status: 'pending' | 'done' | 'error'
  response?: ChatResponse
  error?: string
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// The whole Chat page: a greeting and one box when empty, a quiet thread
// once it starts. Everything else lives behind the sidebar and the Inspect links.
export function ChatPanel({
  user,
  backend,
  ready,
  turns,
  selectedId,
  tone,
  pulseKey,
  onSend,
  onInspect,
  onShowExamples,
}: {
  user: DemoUser
  backend: Backend | null
  ready: boolean
  turns: Turn[]
  selectedId: string | null
  tone: Tone
  pulseKey?: string
  onSend: (text: string) => void
  onInspect: (id: string) => void
  onShowExamples: () => void
}) {
  const busy = turns.some((t) => t.status === 'pending')
  const lastStatus = turns[turns.length - 1]?.status

  useEffect(() => {
    if (turns.length) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reducedMotion() ? 'instant' : 'smooth' })
  }, [turns.length, lastStatus])

  if (turns.length === 0) {
    return (
      <section data-tone={tone} className="home-panel">
        <header className="home-topline">
          <span>Private by design.</span>
          <span className="home-status"><span className="live-dot" />{backend === 'mock' ? 'mock' : backend === 'simulated' ? 'simulated' : ready ? 'live gateway' : 'connecting…'}</span>
        </header>
        <div className="home-hero">
          <div className="home-copy">
            <h1 className="home-title"><span className="hero-title-line">AI WITHOUT</span><span className="hero-title-line">THE EXPOSURE.</span></h1>
            <p className="home-description">Ask freely. Private values stay protected.<br />Your ideas are what reach the model.</p>
            <button className="hero-cta" onClick={() => document.querySelector<HTMLTextAreaElement>('[aria-label="Message"]')?.focus()} disabled={!ready}>Start a conversation <Arrow /></button>
          </div>
          <GatewayLens />
        </div>
        <div className="home-workspace">
          <div className="home-greeting"><h2>{greeting()}, {user.name.split(' ')[0]}.</h2><p>{ready ? 'What can I help with?' : 'Signing you in…'}</p></div>
          <Composer onSend={onSend} disabled={!ready} busy={false} big />
          <ul className="home-starters">
            {starters.map(s => <li key={s}><button disabled={!ready} onClick={() => onSend(s)}>{s}<Arrow /></button></li>)}
          </ul>
          <button onClick={onShowExamples} className="home-inspect"><Icon name="eye" className="h-4 w-4" />See what the model actually receives<Arrow /></button>
        </div>
      </section>
    )
  }

  return (
    <section data-tone={tone} className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[760px] flex-col lg:min-h-screen">
      <div className="sticky top-[72px] z-10 flex w-screen -translate-x-1/2 lg:top-0 items-center justify-center gap-2.5 bg-gradient-to-b from-paper/95 via-paper/70 to-transparent pb-8 pt-5 text-[13px] text-faint backdrop-blur-[2px] [margin-left:50%] lg:w-[calc(100vw-264px)] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
        <Orb tone={tone} size={24} busy={busy} pulseKey={pulseKey} anchor />
        <span>
          {user.name} · {busy ? 'checking…' : `${turns.length} ${turns.length === 1 ? 'message' : 'messages'}`}
        </span>
      </div>

      <div className="relative flex-1 space-y-8 pb-6">
        {turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            inspected={t.id === selectedId}
            fresh={t.id === pulseKey}
            onInspect={() => onInspect(t.id)}
            onResend={busy || !ready ? undefined : onSend}
            backend={backend}
          />
        ))}
      </div>

      <div className="sticky bottom-0 z-10 w-screen -translate-x-1/2 bg-gradient-to-t from-paper via-paper/85 to-transparent px-4 pb-5 pt-10 [margin-left:50%] sm:px-8 lg:w-[calc(100vw-264px)] lg:px-12">
        <div className="mx-auto max-w-[760px]">
          <Composer onSend={onSend} disabled={!ready || busy} busy={busy} />
        </div>
      </div>
    </section>
  )
}

function TurnView({
  turn,
  fresh,
  inspected,
  onInspect,
  onResend,
  backend,
}: {
  turn: Turn
  fresh: boolean
  inspected: boolean
  onInspect: () => void
  onResend?: (text: string) => void
  backend: Backend | null
}) {
  const r = turn.response
  const safer = r?.action === 'block' && r.findings.some((f) => f.category === 'SECRET') ? replaceSecrets(turn.prompt) : null
  const canReplace = safer !== null && safer !== turn.prompt
  const tone: Tone = turn.status === 'pending' ? 'idle' : toneOf(r?.action)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <p className="max-w-[85%] origin-bottom-right animate-pop whitespace-pre-wrap break-words rounded-[20px] rounded-br-[6px] border border-line-2 bg-surface/90 px-4 py-2.5 text-[15px] leading-relaxed text-fg shadow-[var(--shadow)] backdrop-blur">
          <Tokens text={turn.prompt} />
        </p>
      </div>

      <div className="flex gap-3">
        <span className="mt-0.5">
          <Orb
            tone={turn.status === 'error' ? 'stop' : tone}
            size={24}
            busy={turn.status === 'pending'}
            anchor={turn.status === 'pending'}
            pulseKey={fresh ? turn.id : undefined}
          />
        </span>
        <div className="min-w-0 flex-1 animate-msg">
          {turn.status === 'pending' && (
            <p data-tone="idle" className="flex h-[22px] items-center gap-3 text-[13.5px] text-faint">
              <span className="wave" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} style={{ ['--d' as string]: i }} />
                ))}
              </span>
              <span className="sheen sheen-fast">Running the checks</span>
            </p>
          )}

          {turn.status === 'error' && <p className="text-[15px] text-muted">Gateway error: {turn.error}</p>}

          {r && (
            <>
              {/* Plain text only: answers are never rendered as HTML. */}
              <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-fg">
                <Reveal text={answerText(r)} animate={fresh} />
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-faint">
                <ActionBadge label={actionLabel[r.action]} stop={isStop(r.action)} className={fresh ? 'verdict' : ''} />
                {backend === 'mock' && <span className="chip py-0.5">mock</span>}
                {r.reason && <span className="text-muted">{r.reason}</span>}
                <button
                  onClick={onInspect}
                  aria-pressed={inspected}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-faint transition hover:bg-surface-2 hover:text-fg"
                >
                  <Icon name="eye" className="h-[15px] w-[15px]" />
                  Inspect
                </button>
                <span className="tabular-nums">
                  {r.provider_calls} model {r.provider_calls === 1 ? 'call' : 'calls'}
                </span>
              </div>
            </>
          )}

          {canReplace && (
            <button onClick={() => onResend?.(safer!)} disabled={!onResend} className="btn btn-primary btn-sm mt-4 font-mono text-[12px]">
              Replace with [SECRET_…] and send
              <Arrow />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const hints = [
  'Message LeakShield…',
  'Paste a log with an API key. It never reaches the model.',
  'Ask for a letter with an Aadhaar number in it…',
  'Ask about a document you may not be allowed to see…',
]

// Cycles the placeholder like someone typing, while the box is empty.
function useTypewriter(active: boolean) {
  const [shown, setShown] = useState(hints[0])
  useEffect(() => {
    if (!active || reducedMotion()) {
      setShown(hints[0])
      return
    }
    let phrase = 0
    let len = hints[0].length
    let deleting = false
    let timer = window.setTimeout(function tick() {
      const full = hints[phrase]
      if (!deleting && len === full.length) {
        deleting = true
        timer = window.setTimeout(tick, 2600)
        return
      }
      if (deleting && len === 0) {
        deleting = false
        phrase = (phrase + 1) % hints.length
      }
      len += deleting ? -1 : 1
      setShown(hints[phrase].slice(0, len))
      timer = window.setTimeout(tick, deleting ? 18 : 38)
    }, 2600)
    return () => clearTimeout(timer)
  }, [active])
  return shown
}

function Composer({ onSend, disabled, busy, big }: { onSend: (t: string) => void; disabled: boolean; busy: boolean; big?: boolean }) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [launches, setLaunches] = useState(0)
  const box = useRef<HTMLTextAreaElement>(null)
  const hint = useTypewriter(!text && !focused)
  const submit = () => {
    const t = text.trim()
    if (!t || disabled) return
    onSend(t)
    setText('')
    setLaunches((n) => n + 1)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }
  const lines = Math.min(6, Math.max(big ? 2 : 1, text.split('\n').length))
  return (
    <div
      onClick={() => box.current?.focus()}
      data-busy={busy ? 'true' : undefined}
      className="composer cursor-text rounded-[24px] border border-line bg-surface/90 p-2 pl-5 text-left shadow-[var(--shadow-lg)] backdrop-blur-xl transition-[border-color] duration-300 focus-within:border-transparent"
    >
      <div className="relative flex items-end gap-3">
        {!text && (
          <span aria-hidden="true" className="pointer-events-none absolute left-0 top-2 text-[15.5px] leading-relaxed text-faint">
            {hint}
            {!focused && <span className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] animate-pulse bg-faint" />}
          </span>
        )}
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={lines}
          aria-label="Message"
          className="max-h-48 min-w-0 flex-1 resize-none self-center bg-transparent py-2 text-[15.5px] leading-relaxed text-fg focus:outline-none"
        />
        <Magnetic strength={0.3}>
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-fg text-void shadow-[0_6px_20px_-6px_var(--tone)] transition duration-300 [transition-timing-function:var(--ease-spring)] hover:scale-110 active:scale-90 disabled:scale-90 disabled:opacity-20 disabled:shadow-none"
          >
            <span key={launches} className={launches ? 'launch' : ''}>
              <Icon name="up" className="h-[18px] w-[18px]" />
            </span>
          </button>
        </Magnetic>
      </div>
    </div>
  )
}
