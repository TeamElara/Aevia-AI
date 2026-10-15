import { useEffect, useRef, useState } from 'react'
import { chat, chatWithFile, login, pollApprovalResult, type Backend } from './api/client'
import { actionLabel, answerText, isStop } from './api/contract'
import { ChatPanel, type Turn } from './components/ChatPanel'
import { PayloadCard, type Exchange } from './components/PayloadCard'
import { SignIn } from './components/SignIn'
import { Avatar, Sidebar } from './components/Sidebar'
import type { View } from './lib/views'
import { BrandMark, Drawer, Icon, Toast, Wordmark } from './components/ui'
import { exampleExchanges, users } from './data/demo'
import { pad2 } from './lib/format'
import { withTransition } from './lib/motion'
import { toneOf } from './lib/tone'
import { ApprovalsView } from './views/ApprovalsView'
import { EvalView } from './views/EvalView'
import { IncidentsView } from './views/IncidentsView'
import { OverviewView } from './views/OverviewView'
import { useActingPosts } from './lib/useActingPosts'
import { AssignPostModal, CoveringBadge } from './components/ActingPosts'

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
  const chatGeneration = useRef(0)
  const [signInOpen, setSignInOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [cardDir, setCardDir] = useState<1 | -1>(1)
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const posts = useActingPosts(session)

  function go(next: View) {
    setNavOpen(false)
    if (next === view) return
    withTransition(() => {
      setView(next)
      window.scrollTo(0, 0)
    })
  }

  function signInAs(id: string) {
    setSignInOpen(false)
    if (id === activeUser) return
    pickUser(id)
    setToast({ text: `Signed in as ${users.find((u) => u.id === id)!.name}`, key: Date.now() })
  }

  function newChat() {
    resetChat()
    go('Chat')
    setNavOpen(false)
  }

  function inspect(id: string) {
    setSelectedId(id)
    setInspectorOpen(true)
  }

  // Cards light up under the pointer.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.('.card') as HTMLElement | null
      if (!card) return
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

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
      chatGeneration.current += 1
    }
  }, [activeUser])

  useEffect(() => {
    if (!session || session.backend === 'mock') return
    const pending = turns.filter(turn => turn.response?.action === 'require_approval')
    if (!pending.length) return
    let cancelled = false
    let polling = false
    const generation = chatGeneration.current
    const timer = setInterval(async () => {
      if (polling) return
      polling = true
      await Promise.all(pending.map(async turn => {
        const response = turn.response!
        await pollApprovalResult(session.token, response.request_id, response.conversation_id)
          .then(result => { if (result && !cancelled && generation === chatGeneration.current) setTurns(rows => rows.map(row => row.id === turn.id ? { ...row, response: result } : row)) })
          .catch(() => { if (!cancelled && generation === chatGeneration.current) setTurns(rows => rows.map(row => row.id === turn.id ? { ...row, status: 'error', error: 'Approval result unavailable or expired.' } : row)) })
      }))
      polling = false
    }, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [session, turns])

  function resetChat() {
    // Invalidate in-flight replies before clearing or changing their conversation.
    chatGeneration.current += 1
    setTurns([])
    setConversationId(null)
    setSelectedId(null)
  }

  function pickUser(id: string) {
    if (id === activeUser) return
    setSession(null)
    setAssignOpen(false)
    resetChat()
    setActiveUser(id)
  }

  async function send(text: string, file?: File) {
    if (!session) return
    const generation = chatGeneration.current
    const id = crypto.randomUUID()
    setTurns((ts) => [...ts, { id, prompt: text, status: 'pending', ...(file ? { file: { name: file.name, size: file.size } } : {}) }])
    try {
      const req = { conversation_id: conversationId, message: text }
      const res = file ? await chatWithFile(session.backend, session.token, req, file) : await chat(session.backend, session.token, req)
      if (generation !== chatGeneration.current) return
      setConversationId(res.conversation_id)
      setUnreachable(false)
      setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, status: 'done', response: res } : t)))
      setSelectedId(id)
    } catch (e) {
      if (generation !== chatGeneration.current) return
      setUnreachable((e as Error).message === 'GATEWAY_UNREACHABLE')
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
    setCardDir(i < cardIndex ? -1 : 1)
    const next = (i + cards.length) % cards.length
    if (showingLive) setSelectedId(done[next].id)
    else setExampleIndex(next)
  }

  const userIndex = users.findIndex((u) => u.id === activeUser)
  const user = users[userIndex]
  const last = done[done.length - 1]
  const busy = turns.some((t) => t.status === 'pending')
  const tone = toneOf(last?.response?.action)

  const sidebar = (
    <Sidebar
      unreachable={unreachable}
      view={view}
      tone={tone}
      user={user}
      userIndex={userIndex}
      backend={session?.backend ?? null}
      onGo={go}
      onNewChat={newChat}
      onSignIn={() => {
        setNavOpen(false)
        setSignInOpen(true)
      }}
      posts={posts}
      onAssign={() => { setNavOpen(false); setAssignOpen(true) }}
    />
  )

  return (
    <div data-tone={tone} className="min-h-screen overflow-x-clip lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 z-20 hidden h-screen border-r border-line bg-paper/70 backdrop-blur-xl lg:block">{sidebar}</aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur-md lg:hidden">
          <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <button onClick={() => go('Chat')} className="flex items-center gap-2" aria-label="LeakShield, open Chat">
            <BrandMark size={26} busy={busy} />
            <Wordmark className="text-[17px]" />
          </button>
          <button onClick={() => setSignInOpen(true)} aria-label={`Signed in as ${user.name}. Change who is signed in`} className="rounded-full transition active:scale-95">
            <Avatar user={user} index={userIndex} size={34} />
          </button>
        </header>

        <main key={view} className={`relative z-10 flex flex-1 flex-col px-4 sm:px-8 lg:px-12 ${view === 'Chat' ? '' : 'mx-auto w-full max-w-[1180px] pb-16'}`}>
          {view === 'Chat' && (
            <ChatPanel
              user={user}
              backend={session?.backend ?? null}
              ready={!!session}
              turns={turns}
              selectedId={inspectorOpen ? selectedId : null}
              tone={tone}
              pulseKey={last?.id}
              onSend={send}
              onInspect={inspect}
              onShowExamples={() => setInspectorOpen(true)}
              actingPosts={posts.me?.covering.length ? <CoveringBadge covering={posts.me.covering} posts={posts} /> : undefined}
            />
          )}
          {view === 'Incidents' && <IncidentsView />}
          {view === 'Overview' && <OverviewView />}
          {view === 'Approvals' && <ApprovalsView />}
          {view === 'Eval' && <EvalView />}
        </main>
        {view !== 'Chat' && (
          <footer className="mx-auto w-full max-w-[1180px] px-4 pb-8 text-[12px] text-faint sm:px-8 lg:px-12">
            Synthetic demo data · Policy v1 · provider{' '}
            {session?.backend === 'simulated' ? 'simulated' : session?.backend === 'mock' ? 'mock' : 'gateway configured'} · audit stores metadata
            only · Team Elara, CyberCUP 6.0
          </footer>
        )}
      </div>

      <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Menu" side="left">
        {sidebar}
      </Drawer>

      <Drawer open={inspectorOpen} onClose={() => setInspectorOpen(false)} label="Inspector">
        <Inspector cards={cards} index={cardIndex} dir={cardDir} example={!showingLive} onPick={pick} onClose={() => setInspectorOpen(false)} />
      </Drawer>

      <SignIn open={signInOpen} current={activeUser} onClose={() => setSignInOpen(false)} onPick={signInAs} />
      <AssignPostModal key={activeUser} open={assignOpen} onClose={() => setAssignOpen(false)} userId={activeUser} posts={posts} />

      {toast && (
        <Toast key={toast.key}>
          <Avatar user={user} index={userIndex} size={22} />
          {toast.text}
        </Toast>
      )}
    </div>
  )
}

// What the user typed, what the model received and what came back, one
// request at a time.
function Inspector({
  cards,
  index,
  dir,
  example,
  onPick,
  onClose,
}: {
  cards: Exchange[]
  index: number
  dir: 1 | -1
  example: boolean
  onPick: (i: number) => void
  onClose: () => void
}) {
  return (
    <div className="flex min-h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-[30px] leading-tight">Inspector</h2>
          <p className="mt-1 text-[13.5px] text-faint">
            {example ? 'Example requests. Send a message to see your own.' : 'What the model actually received for each message.'}
          </p>
        </div>
        <button className="icon-btn -mr-2" onClick={onClose} aria-label="Close inspector">
          <Icon name="close" />
        </button>
      </div>

      <div className="flex flex-1 items-center py-8">
        <div
          key={`${example}-${index}`}
          className="w-full animate-deal"
          style={{ ['--dx' as string]: `${dir * 36}px`, ['--ry' as string]: `${dir * -14}deg` }}
        >
          <PayloadCard exchange={cards[index]} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <ArrowButton dir="prev" onClick={() => onPick(index - 1)} />
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Choose request">
            {cards.slice(-12).map((_, j) => {
              const i = cards.length - Math.min(12, cards.length) + j
              return (
                <button
                  key={i}
                  onClick={() => onPick(i)}
                  aria-label={`Request ${i + 1}`}
                  aria-pressed={i === index}
                  className={`h-1.5 rounded-full transition-all duration-500 ${i === index ? 'w-6 bg-fg' : 'w-1.5 bg-fg/25 hover:bg-fg/50'}`}
                />
              )
            })}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-faint">
            {pad2(index + 1)} / {pad2(cards.length)}
          </span>
        </div>
        <ArrowButton dir="next" onClick={() => onPick(index + 1)} />
      </div>
    </div>
  )
}

function ArrowButton({ dir, onClick }: { dir: 'next' | 'prev'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'next' ? 'Next card' : 'Previous card'}
      className="icon-btn h-10 w-12 rounded-full border border-line"
    >
      <svg width="14" height="8" viewBox="0 0 14 8" fill="none" aria-hidden="true">
        <path d={dir === 'next' ? 'M0 4h12M9 1l3 3-3 3' : 'M14 4H2M5 1L2 4l3 3'} stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  )
}

