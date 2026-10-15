import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Backend } from '../api/client'
import { actionLabel, answerText, isStop, type ChatResponse } from '../api/contract'
import { backendLabel, ms } from '../lib/format'
import { pipeline, starters, type DemoUser } from '../data/demo'
import { ActionBadge } from './PayloadCard'
import { replaceSecrets } from '../lib/secrets'

export type Turn = {
  id: string
  prompt: string
  status: 'pending' | 'done' | 'error'
  response?: ChatResponse
  error?: string
}

export function ChatPanel({
  user,
  backend,
  ready,
  turns,
  selectedId,
  onSelect,
  onSend,
  onReset,
}: {
  user: DemoUser
  backend: Backend | null
  ready: boolean
  turns: Turn[]
  selectedId: string | null
  onSelect: (id: string) => void
  onSend: (text: string) => void
  onReset: () => void
}) {
  const busy = turns.some((t) => t.status === 'pending')
  const threadRef = useRef<HTMLDivElement>(null)
  const lastStatus = turns[turns.length - 1]?.status

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, lastStatus])

  return (
    <section className="sheet flex min-h-[560px] min-w-0 flex-col lg:min-h-0">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-8">
          <p className="text-[13px] font-medium tracking-[-0.01em] text-fg">{user.name}</p>
          <p className="text-[12px] text-faint">{user.role}</p>
          {backend && (
            <span
              className="ml-auto text-[12px] text-faint"
              title={backend === 'simulated' ? 'Real local gateway with a simulated provider' : backend === 'mock' ? 'apps/gateway is not running; replies come from the built-in mock' : 'Connected to apps/gateway'}
            >
              <span className={backend === 'live' ? 'text-fg' : ''}>●</span> {backendLabel[backend]}
            </span>
          )}
          {turns.length > 0 && (
            <button onClick={onReset} className="text-[12px] text-fg underline decoration-1 underline-offset-[3px] hover:text-muted">
              New chat
            </button>
          )}
        </div>

        <div ref={threadRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-8">
          {turns.length === 0 ? (
            <EmptyState onPick={onSend} disabled={!ready} />
          ) : (
            turns.map((t) => (
              <TurnView
                key={t.id}
                turn={t}
                selected={t.id === selectedId}
                onSelect={() => onSelect(t.id)}
                onResend={busy || !ready ? undefined : onSend}
                backend={backend}
              />
            ))
          )}
        </div>

        <Composer onSend={onSend} disabled={!ready || busy} />
    </section>
  )
}

function EmptyState({ onPick, disabled }: { onPick: (t: string) => void; disabled: boolean }) {
  return (
    <div className="flex h-full flex-col justify-between gap-10">
      <div className="grid grid-cols-2 gap-x-6">
        <p className="text-[13px] text-fg">Pipeline</p>
        <ol className="font-mono text-[11px] leading-[1.75] text-muted">
          {pipeline.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </div>
      <div>
        <p className="mb-2 text-[13px] text-fg">Try</p>
        <ul className="border-t border-line">
          {starters.map((s) => (
            <li key={s} className="border-b border-line">
              <button
                disabled={disabled}
                onClick={() => onPick(s)}
                className="group flex w-full items-baseline gap-4 py-2.5 text-left text-[14px] text-muted transition hover:text-fg disabled:opacity-40"
              >
                <span className="min-w-0 flex-1 truncate">{s}</span>
                <span className="text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden="true">
                  ↗
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function TurnView({
  turn,
  selected,
  onSelect,
  onResend,
  backend,
}: {
  turn: Turn
  selected: boolean
  onSelect: () => void
  onResend?: (text: string) => void
  backend: Backend | null
}) {
  const r = turn.response
  const safer = r?.action === 'block' && r.findings.some((f) => f.category === 'SECRET') ? replaceSecrets(turn.prompt) : null
  const canReplace = safer !== null && safer !== turn.prompt
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words bg-fg px-3.5 py-2.5 text-[14px] leading-relaxed text-void">
          {turn.prompt}
        </p>
      </div>

      {turn.status === 'pending' && (
        <p className="text-[12px] text-faint">
          Inspecting<span className="animate-pulse">…</span>
        </p>
      )}

      {turn.status === 'error' && <p className="text-[14px] text-muted">Gateway error: {turn.error}</p>}

      {r && (
        <button
          onClick={onSelect}
          className={`block w-full border-l-2 py-1 pl-3.5 text-left transition ${
            selected ? 'border-fg' : 'border-transparent hover:border-line-strong'
          }`}
        >
          {/* Plain text only: answers are never rendered as HTML. */}
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-fg">{answerText(r)}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ActionBadge label={actionLabel[r.action]} stop={isStop(r.action)} />
            {backend === 'mock' && <span className="font-mono text-[10px] tracking-wider text-faint">MOCK</span>}
            {r.reason && <span className="text-[12px] text-muted">{r.reason}</span>}
            <span className="font-mono text-[10px] text-faint">
              {Object.entries(r.stage_ms)
                .map(([k, v]) => `${k} ${ms(v)}`)
                .join(' · ')}
              {' · '}calls <span className="text-fg">{r.provider_calls}</span>
            </span>
          </div>
        </button>
      )}

      {canReplace && (
        <button
          onClick={() => onResend?.(safer!)}
          disabled={!onResend}
          className="ml-3.5 rounded-full border border-line-strong px-3 py-1 font-mono text-[11px] text-fg transition hover:border-fg disabled:opacity-40"
        >
          Replace with [SECRET_…] and send
        </button>
      )}
    </div>
  )
}

function Composer({ onSend, disabled }: { onSend: (t: string) => void; disabled: boolean }) {
  const [text, setText] = useState('')
  const submit = () => {
    const t = text.trim()
    if (!t || disabled) return
    onSend(t)
    setText('')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }
  return (
    <div className="border-t border-line p-4 sm:px-6">
      <div className="flex items-end gap-3 border border-line-strong bg-void px-3.5 py-2.5 focus-within:border-fg">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={Math.min(5, Math.max(1, text.split('\n').length))}
          placeholder="Ask anything. Sensitive values never reach the model."
          aria-label="Message"
          className="max-h-40 flex-1 resize-none bg-transparent text-[14px] leading-relaxed text-fg placeholder:text-faint focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label="Send"
          className="grid h-8 w-12 shrink-0 place-items-center rounded-full bg-fg text-void transition hover:bg-fg/80 disabled:opacity-25"
        >
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true">
            <path d="M0 4h12M9 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
