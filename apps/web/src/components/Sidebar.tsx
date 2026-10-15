import type { Backend } from '../api/client'
import type { DemoUser } from '../data/demo'
import { backendLabel, initials } from '../lib/format'
import { avatarTone, type View } from '../lib/views'
import { useState, type PointerEvent } from 'react'
import { useSlider } from '../lib/useSlider'
import { BrandMark, Icon, Magnetic, ThemeToggle } from './ui'
import type { ActingPosts } from '../lib/useActingPosts'


const monitor: { id: View; icon: Parameters<typeof Icon>[0]['name']; sub: string }[] = [
  { id: 'Incidents', icon: 'bolt', sub: 'Live stream' },
  { id: 'Overview', icon: 'chart', sub: 'Stats' },
  { id: 'Approvals', icon: 'clock', sub: 'Held requests' },
  { id: 'Eval', icon: 'check', sub: 'Red-team run' },
]


export function Avatar({ user, index, size = 32 }: { user: DemoUser; index: number; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: avatarTone[index % avatarTone.length] }}
      aria-hidden="true"
    >
      {initials(user.name)}
    </span>
  )
}

export function Sidebar({
  view,
  user,
  userIndex,
  backend,
  unreachable,
  onGo,
  onNewChat,
  onSignIn,
  posts,
  onAssign,
}: {
  view: View
  user: DemoUser
  userIndex: number
  backend: Backend | null
  /** The last request could not reach the gateway. */
  unreachable?: boolean
  onGo: (v: View) => void
  onNewChat: () => void
  onSignIn: () => void
  posts: ActingPosts
  onAssign: () => void
}) {
  const [navRef, pill] = useSlider(view)
  const [hover, setHover] = useState<{ y: number; h: number } | null>(null)
  const onHover = (e: PointerEvent<HTMLElement>) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('.nav-item')
    setHover(item ? { y: item.offsetTop, h: item.offsetHeight } : null)
  }
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <button onClick={() => onGo('Chat')} className="flex items-center gap-2.5 px-2 pt-1" aria-label="LeakShield, open Chat">
        <BrandMark size={34} />
        <span className="font-display text-[18px] font-semibold tracking-[-0.03em]">LeakShield</span>
      </button>

      <Magnetic strength={0.08} className="w-full">
        <button onClick={onNewChat} className="btn btn-ghost group w-full justify-start shadow-[var(--shadow)]">
          <span className="transition-transform duration-500 [transition-timing-function:var(--ease-spring)] group-hover:rotate-90">
            <Icon name="plus" />
          </span>
          New chat
        </button>
      </Magnetic>

      <nav
        ref={navRef}
        aria-label="Views"
        className="relative space-y-5"
        onPointerOver={onHover}
        onPointerLeave={() => setHover(null)}
      >
        <span className="nav-pill" style={pill} aria-hidden="true" />
        <span
          className="nav-hover"
          aria-hidden="true"
          style={hover ? { width: '100%', height: hover.h, transform: `translateY(${hover.y}px)`, opacity: 1 } : { width: '100%' }}
        />
        <button className="nav-item" data-on={view === 'Chat'} aria-current={view === 'Chat' ? 'page' : undefined} onClick={() => onGo('Chat')}>
          <Icon name="chat" />
          Chat
        </button>
        <div>
          <p className="label mb-1.5 px-2.5">Monitor</p>
          <div className="space-y-0.5">
            {monitor.map((m) => (
              <button key={m.id} className="nav-item" data-on={view === m.id} aria-current={view === m.id ? 'page' : undefined} onClick={() => onGo(m.id)}>
                <Icon name={m.icon} />
                <span className="flex-1">{m.id}</span>
                <span className="text-[11.5px] text-faint">{m.sub}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between px-2.5">
          <span
            className="flex items-center gap-2 text-[12.5px] text-faint"
            title={unreachable ? 'The last request could not reach apps/gateway' : backend === 'simulated' ? 'Real local gateway with a simulated provider' : backend === 'mock' ? 'apps/gateway is not running; replies come from the built-in mock' : backend ? 'Connected to apps/gateway' : 'Signing in'}
          >
            <span className="live-dot" style={backend === 'live' && !unreachable ? undefined : { background: unreachable ? 'var(--color-stop)' : 'var(--color-faint)', animation: 'none' }} />
            {unreachable ? 'gateway unreachable' : backend ? backendLabel[backend] : 'connecting…'}
          </span>
          <ThemeToggle />
        </div>
        <button className="btn btn-ghost w-full text-[13px]" onClick={onAssign} disabled={posts.loading || !posts.me?.lendable_groups.length} title={posts.error ?? undefined}>
          {posts.loading ? 'Loading posts…' : posts.me && !posts.me.lendable_groups.length ? 'Nothing to assign' : 'Assign my post'}
        </button>
        {posts.error && <p className="px-2 text-[11px] text-muted" role="status">{posts.error}<button className="ml-1 underline underline-offset-2" onClick={posts.refresh}>Retry</button></p>}
        {!!posts.list?.given.length && !posts.me?.lendable_groups.length && <button className="w-full py-2 text-[12px] text-muted" onClick={onAssign}>View assigned posts</button>}
        <button
          onClick={onSignIn}
          className="card flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:border-line-strong"
          aria-label={`Signed in as ${user.name}. Change who is signed in`}
        >
          <Avatar user={user} index={userIndex} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{user.name}</span>
            <span className="block truncate text-[12px] text-faint">{user.role} · switch</span>
          </span>
          <Icon name="chevron" className="h-4 w-4 text-faint" />
        </button>
      </div>
    </div>
  )
}
