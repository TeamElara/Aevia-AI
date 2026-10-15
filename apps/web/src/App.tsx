import { useEffect, useState } from 'react'
import { chat, login, pollApprovalResult, type Backend } from './api/client'
import { actionLabel, answerText, isStop } from './api/contract'
import { ChatPanel, type Turn } from './components/ChatPanel'
import { Masthead } from './components/Masthead'
import { PayloadCard, type Exchange } from './components/PayloadCard'
import { exampleExchanges, users } from './data/demo'
import { backendLabel, pad2 } from './lib/format'
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

  const pick = (i: number) => {
    const next = (i + cards.length) % cards.length
    if (showingLive) setSelectedId(done[next].id)
    else setExampleIndex(next)
  }

  const user = users.find((u) => u.id === activeUser)!

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col px-3 pb-3 sm:px-5 sm:pb-5">
        <header className="grid grid-cols-2 items-baseline gap-y-2 pb-3 pt-4 text-[12px] md:grid-cols-3">
          <span className="font-medium tracking-[-0.01em]">LeakShield©</span>
          <nav className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto md:justify-self-center" aria-label="Views">
            {views.map((v, i) => (
              <span key={v}>
                <button
                  onClick={() => setView(v)}
                  aria-current={v === view ? 'page' : undefined}
                  className={`transition-colors ${v === view ? 'text-fg underline decoration-1 underline-offset-[3px]' : 'text-faint hover:text-fg'}`}
                >
                  {v}
                </button>
                {i < views.length - 1 && <span className="text-faint">, </span>}
              </span>
            ))}
          </nav>
          <div className="flex items-baseline justify-end gap-4">
            {session && (
              <span
                className="hidden text-faint sm:inline"
                title={session.backend === 'simulated' ? 'Real local gateway with a simulated provider' : session.backend === 'mock' ? 'apps/gateway is not running; replies come from the built-in mock' : 'Connected to apps/gateway'}
              >
                <span className={session.backend === 'live' ? 'text-fg' : ''}>●</span> {backendLabel[session.backend]}
              </span>
            )}
            <button onClick={() => setView('Eval')} className="text-fg hover:underline">
              Run eval ↗
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-3">
          {view === 'Chat' && (
            <>
              <Masthead title="LeakShield©">
                A gateway that lets your AI work on data it never sees. Every prompt passes seven checks; the model only
                ever receives tokens.
              </Masthead>
              <div className="grid grid-cols-1 gap-3 lg:h-[760px] lg:grid-cols-2">
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
                  cards={cards}
                  index={cardIndex}
                  example={!showingLive}
                  activeUser={activeUser}
                  onPick={pick}
                  onPickUser={setActiveUser}
                />
              </div>
            </>
          )}
          {view === 'Incidents' && <IncidentsView />}
          {view === 'Overview' && <OverviewView />}
          {view === 'Approvals' && <ApprovalsView />}
          {view === 'Eval' && <EvalView />}
        </main>

        <footer className="mt-3 grid grid-cols-1 gap-y-1 pt-3 text-[11px] text-faint sm:grid-cols-3">
          <span>Policy v1 · provider {session?.backend === 'simulated' ? 'simulated' : session?.backend === 'mock' ? 'mock' : 'gateway configured'}</span>
          <span className="sm:justify-self-center">Audit stores metadata only</span>
          <span className="sm:justify-self-end">TeamElara · CyberCUP 6.0</span>
        </footer>
      </div>
    </div>
  )
}

function Inspector({
  cards,
  index,
  example,
  activeUser,
  onPick,
  onPickUser,
}: {
  cards: Exchange[]
  index: number
  example: boolean
  activeUser: string
  onPick: (i: number) => void
  onPickUser: (id: string) => void
}) {
  const behind = Math.min(2, cards.length - 1)
  return (
    <section className="ink flex min-h-[640px] min-w-0 flex-col px-5 py-5 sm:px-8 sm:py-6">
      <div className="grid grid-cols-2 items-baseline text-[12px] sm:grid-cols-3">
        <span>Inspector</span>
        <span className="hidden text-faint sm:block sm:justify-self-center">{example ? 'Example requests' : 'This conversation'}</span>
        <span className="justify-self-end font-mono text-[11px] text-faint">
          <span className="text-fg">{pad2(index + 1)}</span> / {pad2(cards.length)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6">
        <p className="text-[13px]">Signed in as</p>
        <div role="radiogroup" aria-label="Signed-in demo user" className="flex flex-col items-start">
          {users.map((u) => (
            <button
              key={u.id}
              role="radio"
              aria-checked={u.id === activeUser}
              onClick={() => onPickUser(u.id)}
              className={`text-left text-[clamp(20px,2vw,26px)] leading-[1.08] tracking-[-0.035em] transition-colors ${
                u.id === activeUser ? 'text-fg' : 'text-faint hover:text-muted'
              }`}
            >
              {u.name}
              {u.id === activeUser && (
                <span className="ml-2 align-top font-mono text-[10px] tracking-normal text-muted">{u.role}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center py-8">
        <div className="relative w-full max-w-[340px]">
          {/* Earlier cards fan out behind the selected one. */}
          {behind >= 2 && <div aria-hidden="true" className="absolute inset-0 -translate-x-5 translate-y-5 -rotate-2 bg-fg/25" />}
          {behind >= 1 && <div aria-hidden="true" className="absolute inset-0 -translate-x-2.5 translate-y-2.5 -rotate-1 bg-fg/55" />}
          <div key={`${example}-${index}`} className="relative animate-deal">
            <PayloadCard exchange={cards[index]} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <ArrowButton dir="prev" onClick={() => onPick(index - 1)} />
        <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Choose request">
          {cards.slice(-12).map((_, j) => {
            const i = cards.length - Math.min(12, cards.length) + j
            return (
              <button
                key={i}
                onClick={() => onPick(i)}
                aria-label={`Request ${i + 1}`}
                aria-pressed={i === index}
                className={`h-3 w-3 rounded-full transition-colors ${i === index ? 'bg-fg' : 'bg-fg/25 hover:bg-fg/50'}`}
              />
            )
          })}
        </div>
        <ArrowButton dir="next" onClick={() => onPick(index + 1)} />
      </div>
    </section>
  )
}

function ArrowButton({ dir, onClick }: { dir: 'next' | 'prev'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'next' ? 'Next card' : 'Previous card'}
      className="grid h-8 w-12 place-items-center rounded-full border border-line-strong text-muted transition hover:border-fg hover:text-fg"
    >
      <svg width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true">
        <path d={dir === 'next' ? 'M0 4h12M9 1l3 3-3 3' : 'M14 4H2M5 1L2 4l3 3'} stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  )
}

