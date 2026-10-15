import { useEffect, useState } from 'react'
import { chat, login, pollApprovalResult, type Backend } from './api/client'
import { actionLabel, answerText, isStop } from './api/contract'
import { Chamfer } from './components/Chamfer'
import { ChatPanel, type Turn } from './components/ChatPanel'
import { PayloadCard, type Exchange } from './components/PayloadCard'
import { Starfield } from './components/Starfield'
import { exampleExchanges, users } from './data/demo'
import { initials, pad2 } from './lib/format'
import { ApprovalsView } from './views/ApprovalsView'
import { EvalView } from './views/EvalView'
import { IncidentsView } from './views/IncidentsView'
import { OverviewView } from './views/OverviewView'

const views = ['Chat', 'Incidents', 'Overview', 'Approvals', 'Eval'] as const
type View = (typeof views)[number]

type Session = { token: string; backend: Backend }

const NOT_SENT = 'Nothing. The request stopped before the model.'

export default function App() {
  const [view, setView] = useState<View>('Chat')
  const [activeUser, setActiveUser] = useState('asha')
  const [session, setSession] = useState<Session | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exampleIndex, setExampleIndex] = useState(0)

  // Switching user is a new identity: new token, new conversation, new vault.
  useEffect(() => {
    let cancelled = false
    setSession(null)
    resetChat()
    login(activeUser)
      .then((r) => !cancelled && setSession({ token: r.token, backend: r.backend }))
      .catch(() => !cancelled && setSession(null))
    return () => {
      cancelled = true
    }
  }, [activeUser])

  useEffect(() => {
    if (!session || session.backend === 'mock') return
    const pending = turns.filter(turn => turn.response?.action === 'require_approval')
    if (!pending.length) return
    let cancelled = false
    let polling = false
    const timer = setInterval(async () => {
      if (polling) return
      polling = true
      await Promise.all(pending.map(async turn => {
        const response = turn.response!
        await pollApprovalResult(session.token, response.request_id, response.conversation_id)
          .then(result => { if (result && !cancelled) setTurns(rows => rows.map(row => row.id === turn.id ? { ...row, response: result } : row)) })
          .catch(() => { if (!cancelled) setTurns(rows => rows.map(row => row.id === turn.id ? { ...row, status: 'error', error: 'Approval result unavailable or expired.' } : row)) })
      }))
      polling = false
    }, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [session, turns])

  function resetChat() {
    setTurns([])
    setConversationId(null)
    setSelectedId(null)
  }

  async function send(text: string) {
    if (!session) return
    const id = crypto.randomUUID()
    setTurns((ts) => [...ts, { id, prompt: text, status: 'pending' }])
    try {
      const res = await chat(session.backend, session.token, { conversation_id: conversationId, message: text })
      setConversationId(res.conversation_id)
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'done', response: res } : t)))
      setSelectedId(id)
    } catch (e) {
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'error', error: (e as Error).message } : t)))
    }
  }

  // The card shows the selected reply; before the first reply it cycles examples.
  const done = turns.filter((t) => t.status === 'done' && t.response)
  const live: Exchange[] = done.map((t) => ({
    user: activeUser,
    label: actionLabel[t.response!.action],
    stop: isStop(t.response!.action),
    typed: t.prompt,
    sent: t.response!.sent_to_model ?? NOT_SENT,
    reply: answerText(t.response!),
    providerCalls: t.response!.provider_calls,
    stages: Object.entries(t.response!.stage_ms),
    tag: session?.backend === 'mock' ? 'mock' : session?.backend === 'simulated' ? 'simulated' : undefined,
  }))
  const showingLive = live.length > 0
  const cards = showingLive ? live : exampleExchanges
  const selectedIndex = done.findIndex((t) => t.id === selectedId)
  const cardIndex = showingLive ? (selectedIndex === -1 ? cards.length - 1 : selectedIndex) : exampleIndex

  const step = (delta: number) => {
    const next = (cardIndex + delta + cards.length) % cards.length
    if (showingLive) setSelectedId(done[next].id)
    else setExampleIndex(next)
  }

  const user = users.find((u) => u.id === activeUser)!

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Starfield />

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="flex justify-center">
          <Chamfer corners={{ tl: 0, tr: 0, br: 12, bl: 12 }} className="px-5 py-2.5">
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px]">
              {views.map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-current={v === view ? 'page' : undefined}
                  className={`transition-colors ${v === view ? 'text-fg' : 'text-faint hover:text-muted'}`}
                >
                  {v}
                </button>
              ))}
            </nav>
          </Chamfer>
        </div>

        <div className="mt-3 flex items-baseline justify-between px-1 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
          <span className="text-muted">LeakShield</span>
          <span>gateway console</span>
        </div>

        {view === 'Chat' ? (
          <main className="mt-3 grid flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
            <ChatPanel
              user={user}
              backend={session?.backend ?? null}
              ready={!!session}
              turns={turns}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSend={send}
              onReset={resetChat}
            />
            <Inspector
              exchange={cards[cardIndex]}
              index={cardIndex}
              count={cards.length}
              activeUser={activeUser}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onPickUser={setActiveUser}
            />
          </main>
        ) : (
          <main className="mt-3 flex-1 pb-6">
            {view === 'Incidents' && <IncidentsView />}
            {view === 'Overview' && <OverviewView />}
            {view === 'Approvals' && <ApprovalsView />}
            {view === 'Eval' && <EvalView />}
          </main>
        )}

        <footer className="relative mt-3 flex min-h-14 items-start border-t border-line pt-4 pr-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
            policy v1 · provider {session?.backend === 'simulated' ? 'simulated' : session?.backend === 'mock' ? 'mock' : 'gateway configured'} · audit metadata only
          </p>
          <GlowButton label="Run eval" onClick={() => setView('Eval')} />
        </footer>
      </div>
    </div>
  )
}

function Inspector({
  exchange,
  index,
  count,
  activeUser,
  onPrev,
  onNext,
  onPickUser,
}: {
  exchange: Exchange
  index: number
  count: number
  activeUser: string
  onPrev: () => void
  onNext: () => void
  onPickUser: (id: string) => void
}) {
  return (
    <Chamfer className="min-h-[560px] min-w-0">
      <div className="flex h-full flex-col gap-6 p-6 pb-14 sm:flex-row sm:items-center sm:p-8 sm:pb-16">
        <div className="flex flex-1 items-center justify-center py-6 sm:py-0">
          <PayloadCard exchange={exchange} />
        </div>

        <aside className="flex flex-wrap items-center justify-between gap-4 sm:h-full sm:flex-col sm:flex-nowrap sm:justify-between">
          <div className="flex gap-2 sm:flex-col" role="radiogroup" aria-label="Signed-in demo user">
            {users.map((u) => (
              <button
                key={u.id}
                role="radio"
                aria-checked={u.id === activeUser}
                title={`${u.name} · ${u.role}`}
                onClick={() => onPickUser(u.id)}
                className={`grid h-9 w-9 place-items-center rounded-full border font-mono text-[10px] transition ${
                  u.id === activeUser
                    ? 'border-fg bg-fg text-void'
                    : 'border-line text-muted hover:border-line-strong hover:text-fg'
                }`}
              >
                {initials(u.name)}
              </button>
            ))}
          </div>

          <div className="flex gap-2 sm:flex-col">
            <ArrowButton dir="next" onClick={onNext} />
            <ArrowButton dir="prev" onClick={onPrev} />
          </div>

          <p className="font-mono text-[11px] text-faint">
            <span className="text-fg">{pad2(index + 1)}</span> / {pad2(count)}
          </p>
        </aside>
      </div>
    </Chamfer>
  )
}

function ArrowButton({ dir, onClick }: { dir: 'next' | 'prev'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'next' ? 'Next card' : 'Previous card'}
      className="grid h-6 w-9 place-items-center rounded-full border border-line-strong text-muted transition hover:border-fg hover:text-fg"
    >
      <svg width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true">
        <path
          d={dir === 'next' ? 'M0 4h12M9 1l3 3-3 3' : 'M14 4H2M5 1L2 4l3 3'}
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    </button>
  )
}

function GlowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group absolute -top-12 right-0 grid h-24 w-24 place-items-center rounded-full border border-white/40 bg-void font-mono text-[10px] uppercase tracking-[0.18em] text-fg shadow-[0_0_24px_rgba(255,255,255,0.25),inset_0_0_18px_rgba(255,255,255,0.18)] transition hover:shadow-[0_0_40px_rgba(255,255,255,0.45),inset_0_0_24px_rgba(255,255,255,0.3)]"
    >
      {label}
    </button>
  )
}
