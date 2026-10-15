import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Backend } from '../api/client'
import { actionLabel, isStop, type ChatResponse } from '../api/contract'
import { pipeline, starters, type DemoUser } from '../data/demo'
import { Chamfer } from './Chamfer'
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
    <Chamfer className="flex min-h-[560px] min-w-0 flex-col lg:min-h-0">
      <div className="flex h-full min-h-[560px] flex-col lg:min-h-0">
        <div className="flex items-center gap-3 border-b border-line px-6 py-3.5 sm:px-8">
          <p className="text-[13px] text-fg">{user.name}</p>
          <p className="text-[12px] text-faint">{user.role}</p>
          {backend && (
            <span
              className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-faint"
              title={backend === 'simulated' ? 'Real local gateway with a simulated provider' : backend === 'mock' ? 'apps/gateway is not running; replies come from the built-in mock' : 'Connected to apps/gateway'}
            >
              {backend === 'simulated' ? '● simulated provider' : backend === 'mock' ? '● mock gateway' : '● live gateway'}
            </span>
          )}
          {turns.length > 0 && (
            <button onClick={onReset} className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted hover:text-fg">
              New chat
            </button>
          )}
        </div>

        <div ref={threadRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8 lg:max-h-[calc(100vh-290px)]">
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
      </div>
    </Chamfer>
  )
}

function EmptyState({ onPick, disabled }: { onPick: (t: string) => void; disabled: boolean }) {
  return (
    <div className="flex h-full flex-col justify-between gap-8">
      <h1 className="max-w-[17ch] text-[clamp(26px,2.8vw,40px)] font-normal leading-[1.12] tracking-[-0.01em]">
        A gateway that lets your AI work on data it never sees.
      </h1>
      <ol className="self-end pr-[10%] font-mono text-[10px] leading-[1.7] text-faint">
        {pipeline.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <div>
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Try</p>
        <div className="flex flex-wrap gap-2">
          {starters.map((s) => (
            <button
              key={s}
              disabled={disabled}
              onClick={() => onPick(s)}
              className="max-w-full truncate rounded-full border border-line px-3 py-1.5 text-left text-[12.5px] text-muted transition hover:border-line-strong hover:text-fg disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
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
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[4px] border border-line px-3.5 py-2.5 text-[14px] leading-relaxed text-fg">
          {turn.prompt}
        </p>
      </div>

      {turn.status === 'pending' && (
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
          Inspecting<span className="animate-pulse">…</span>
        </p>
      )}

      {turn.status === 'error' && <p className="text-[14px] text-muted">Gateway error: {turn.error}</p>}

      {r && (
        <button
          onClick={onSelect}
          className={`block w-full rounded-[4px] border-l-2 py-1 pl-3.5 text-left transition ${
            selected ? 'border-fg' : 'border-transparent hover:border-line-strong'
          }`}
        >
          {/* Plain text only: answers are never rendered as HTML. */}
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-fg/90">{r.answer}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ActionBadge label={actionLabel[r.action]} stop={isStop(r.action)} />
            {backend === 'mock' && <span className="font-mono text-[10px] tracking-wider text-faint">MOCK</span>}
            {r.reason && <span className="text-[12px] text-muted">{r.reason}</span>}
            <span className="font-mono text-[10px] text-faint">
              {Object.entries(r.stage_ms)
                .map(([k, v]) => `${k} ${v}ms`)
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
      <div className="flex items-end gap-3 rounded-[6px] border border-line bg-black/40 px-3.5 py-2.5 focus-within:border-line-strong">
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
          className="grid h-8 w-11 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition hover:border-fg hover:text-fg disabled:opacity-30"
        >
          <svg width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true">
            <path d="M0 4h12M9 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
