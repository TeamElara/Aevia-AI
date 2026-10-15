import { useState } from 'react'
import { Chamfer } from './components/Chamfer'
import { Starfield } from './components/Starfield'
import { pipeline, scenes, users, type Scene } from './data/demo'

const views = ['Chat', 'Incidents', 'Overview', 'Approvals', 'Eval'] as const
type View = (typeof views)[number]

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export default function App() {
  const [view, setView] = useState<View>('Chat')
  const [sceneIndex, setSceneIndex] = useState(0)
  const [activeUser, setActiveUser] = useState('asha')

  const scene = scenes[sceneIndex]
  const go = (step: number) => {
    const next = (sceneIndex + step + scenes.length) % scenes.length
    setSceneIndex(next)
    setActiveUser(scenes[next].user)
  }
  const pickUser = (id: string) => {
    setActiveUser(id)
    const i = scenes.findIndex((s) => s.user === id)
    if (i >= 0) setSceneIndex(i)
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Starfield />

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col px-4 pb-4 sm:px-6 sm:pb-6">
        {/* Notched nav tab, hanging from the top edge */}
        <div className="flex justify-center">
          <Chamfer corners={{ tl: 0, tr: 0, br: 12, bl: 12 }} className="px-5 py-2.5">
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px]">
              {views.map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
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
            <LeftPanel />
            <RightPanel
              scene={scene}
              sceneIndex={sceneIndex}
              activeUser={activeUser}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
              onPickUser={pickUser}
            />
          </main>
        ) : (
          <main className="mt-3 flex-1">
            <Chamfer className="grid h-full min-h-[60vh] place-items-center p-10">
              <div className="text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">{view}</p>
                <p className="mt-3 text-muted">This view is wired to the gateway in hours 6–12.</p>
              </div>
            </Chamfer>
          </main>
        )}

        <footer className="relative mt-3 flex min-h-14 items-start border-t border-line pt-4 pr-28">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
            policy v1 · provider groq · audit metadata only
          </p>
          <GlowButton label="Run eval" onClick={() => setView('Eval')} />
        </footer>
      </div>
    </div>
  )
}

function LeftPanel() {
  return (
    <Chamfer className="min-h-[420px] lg:min-h-0">
      <div className="flex h-full flex-col justify-between gap-10 p-7 sm:p-10">
        <h1 className="max-w-[17ch] text-[clamp(28px,3.2vw,46px)] font-normal leading-[1.12] tracking-[-0.01em]">
          A gateway that lets your AI work on data it never sees.
        </h1>

        <ol className="self-center font-mono text-[10px] leading-[1.7] text-faint sm:self-end sm:pr-[18%]">
          {pipeline.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>

        <p className="max-w-[36ch] text-[15px] leading-relaxed text-muted">
          Every prompt passes seven checkpoints. Sensitive values leave as tokens and come back
          restored, only for the person who typed them.
        </p>
      </div>
    </Chamfer>
  )
}

function RightPanel({
  scene,
  sceneIndex,
  activeUser,
  onPrev,
  onNext,
  onPickUser,
}: {
  scene: Scene
  sceneIndex: number
  activeUser: string
  onPrev: () => void
  onNext: () => void
  onPickUser: (id: string) => void
}) {
  return (
    <Chamfer className="min-h-[560px]">
      <div className="flex h-full flex-col gap-6 p-6 pb-14 sm:flex-row sm:items-center sm:p-8 sm:pb-16">
        <div className="flex flex-1 items-center justify-center py-6 sm:py-0">
          <PayloadCard scene={scene} />
        </div>

        <aside className="flex flex-wrap items-center justify-between gap-4 sm:h-full sm:flex-col sm:flex-nowrap sm:justify-between">
          <div className="flex gap-2 sm:flex-col" role="listbox" aria-label="Demo user">
            {users.map((u) => (
              <button
                key={u.id}
                role="option"
                aria-selected={u.id === activeUser}
                title={`${u.name} · ${u.role}`}
                onClick={() => onPickUser(u.id)}
                className={`grid h-9 w-9 place-items-center rounded-full border font-mono text-[10px] transition ${
                  u.id === activeUser
                    ? 'border-fg bg-fg text-void'
                    : 'border-line text-muted grayscale hover:border-line-strong hover:text-fg'
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
            <span className="text-fg">{String(sceneIndex + 1).padStart(2, '0')}</span> /{' '}
            {String(scenes.length).padStart(2, '0')}
          </p>
        </aside>
      </div>
    </Chamfer>
  )
}

function PayloadCard({ scene }: { scene: Scene }) {
  const user = users.find((u) => u.id === scene.user)!
  return (
    <div className="w-full max-w-[340px] animate-float [transform-style:preserve-3d]">
      <div className="overflow-hidden rounded-[6px] border border-line-strong bg-gradient-to-b from-[#151515] to-[#070707] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.03)]">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#2a2a2a] font-mono text-[10px] text-fg">
            {initials(user.name)}
          </span>
          <div className="leading-tight">
            <p className="text-[13px] text-fg">{user.name}</p>
            <p className="text-[11px] text-faint">{user.role}</p>
          </div>
          <span
            className={`ml-auto rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider ${
              scene.action === 'BLOCKED' ? 'border-fg bg-fg text-void' : 'border-line-strong text-fg'
            }`}
          >
            {scene.action}
          </span>
        </div>

        <div className="space-y-4 px-4 py-5">
          <Field label="User typed" text={scene.typed} />
          <Field label="Sent to model" text={scene.sent} strong />
          <Field label="User sees" text={scene.reply} />
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-4 py-3 font-mono text-[10px] text-faint">
          {scene.stages.map(([name, ms]) => (
            <span key={name}>
              {name} <span className="text-muted">{ms}ms</span>
            </span>
          ))}
          <span className="ml-auto">
            provider calls <span className="text-fg">{scene.providerCalls}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function Field({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{label}</p>
      <p className={`mt-1 font-mono text-[12.5px] leading-relaxed ${strong ? 'text-fg' : 'text-muted'}`}>{text}</p>
    </div>
  )
}

function ArrowButton({ dir, onClick }: { dir: 'next' | 'prev'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'next' ? 'Next example' : 'Previous example'}
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
