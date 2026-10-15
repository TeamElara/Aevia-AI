import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { coverStatus, type Cover, type Covering } from '../api/delegations'
import { users } from '../data/demo'
import type { ActingPosts } from '../lib/useActingPosts'
import { Icon, Modal } from './ui'

const person = (id: string) => users.find(user => user.id === id)?.name.split(' ')[0] ?? id
const post = (group: string) => ({ hr: 'HR', engineering: 'Engineering', executive: 'Executive' })[group] ?? group
const until = (date: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(date))
const dateTime = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(date))
const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

export function CoverList({ covers, posts, admin = false }: { covers: Cover[]; posts: ActingPosts; admin?: boolean }) {
  return <ul className="post-list">{covers.map(cover => {
    const status = coverStatus(cover)
    const action = status === 'scheduled' && !admin ? 'Cancel' : 'End'
    return <li key={cover.id}>
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{cover.groups.map(post).join(', ')} · {admin ? `${person(cover.from)} → ` : ''}{person(cover.to)}</p>
        <p className="post-meta">{dateTime(cover.starts_at)} – {dateTime(cover.expires_at)}</p>
        <span className="post-status" data-status={status}>{status === 'scheduled' ? 'Scheduled' : status === 'active' ? 'Active' : 'Ended'}</span>
      </div>
      {status !== 'ended' && <button className="btn btn-ghost btn-sm" disabled={!!posts.busy} onClick={() => void posts.end(cover.id)} aria-label={`${action} ${cover.groups.map(post).join(', ')} cover for ${person(cover.to)}`}>
        {posts.busy === cover.id ? 'Updating…' : action}
      </button>}
    </li>
  })}</ul>
}

export function CoveringBadge({ covering, posts }: { covering: Covering[]; posts: ActingPosts }) {
  return <div className="covering-posts" aria-label="Posts you are covering">
    {covering.filter(cover => Date.parse(cover.until) > Date.now()).map(cover => <div key={cover.id} className="covering-post">
      <span className="min-w-0 break-words">Acting {cover.groups.map(post).join(', ')} for {person(cover.for)} · until {until(cover.until)}</span>
      <button className="btn btn-ghost btn-sm" disabled={!!posts.busy} onClick={() => void posts.end(cover.id)} aria-label={`Hand back ${cover.groups.map(post).join(', ')} to ${person(cover.for)}`}>{posts.busy === cover.id ? 'Updating…' : 'Hand back'}</button>
    </div>)}
    {posts.error && <p className="post-error" role="alert">{posts.error}</p>}
  </div>
}

// The shared modal keeps account switching and access changes in distinct flows.
export function AssignPostModal({ open, onClose, userId, posts }: { open: boolean; onClose: () => void; userId: string; posts: ActingPosts }) {
  return <Modal open={open} onClose={onClose} label="Assign my post">
    {open && <AssignPostForm userId={userId} posts={posts} onClose={onClose} />}
  </Modal>
}

function AssignPostForm({ userId, posts, onClose }: { userId: string; posts: ActingPosts; onClose: () => void }) {
  const colleagues = users.filter(user => user.id !== userId)
  const available = posts.me?.lendable_groups ?? []
  const [to, setTo] = useState(colleagues[0]?.id ?? '')
  const [amount, setAmount] = useState('2')
  const [unit, setUnit] = useState<'days' | 'hours'>('days')
  const [start, setStart] = useState<'now' | 'later'>('now')
  const [startsAt, setStartsAt] = useState('')
  const [groups, setGroups] = useState<string[]>(available)
  const [validation, setValidation] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const form = useRef<HTMLDivElement>(null)
  const now = new Date()
  const maxStart = new Date(now.getTime() + 14 * 86400_000)
  const maxHours = Math.min(168, posts.me?.max_hours ?? 168)
  const max = unit === 'days' ? Math.floor(maxHours / 24) : maxHours
  const validGroups = groups.filter(group => available.includes(group))

  // Keep keyboard focus within this modal, including its assignment history.
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const all = [...(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])]
    const first = all[0], last = all[all.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setValidation(null); setNotice(null)
    const duration = Number(amount)
    if (!to || to === userId) { setValidation('Choose a colleague other than yourself.'); return }
    if (!Number.isInteger(duration) || duration < 1 || duration > max) { setValidation(`Choose a whole number from 1 to ${max} ${unit}.`); return }
    if (!validGroups.length) { setValidation('Choose at least one post to assign.'); return }
    const at = start === 'later' ? Date.parse(startsAt) : null
    if (at !== null && (!Number.isFinite(at) || at < Date.now())) { setValidation('Choose a start time in the future.'); return }
    if (at !== null && at > Date.now() + 14 * 86400_000) { setValidation('Choose a start time within the next 14 days.'); return }
    const ok = await posts.assign({ to, groups: validGroups, ...(unit === 'days' ? { days: duration } : { hours: duration }), ...(at !== null ? { starts_at: new Date(at).toISOString() } : {}) })
    if (ok) setNotice(start === 'later' ? 'Cover scheduled. It will begin and end automatically.' : 'Post assigned. It will end automatically at the chosen time.')
  }
  return <div ref={form} onKeyDown={trapFocus} className="assign-post-modal">
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="font-display text-[24px] font-medium">Assign my post</h2><p className="post-meta mt-1">Let a colleague cover your post while you are away.</p></div>
      <button className="icon-btn" aria-label="Close assignment" onClick={onClose}><Icon name="close" /></button>
    </div>
    {posts.loading && <p role="status" className="post-meta mt-4">Loading your posts…</p>}
    {(validation || posts.error) && <p role="alert" className="post-error mt-4">{validation || posts.error}{posts.error && <button className="ml-2 underline" onClick={posts.refresh}>Retry</button>}</p>}
    {notice && <p role="status" className="post-notice mt-4">{notice}</p>}
    {available.length > 0 ? <form onSubmit={submit} className="post-form">
      <label>Colleague<select value={to} onChange={event => setTo(event.target.value)} disabled={!!posts.busy} required>{colleagues.map(user => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label>
      <div className="post-form-row">
        <label>Duration<input type="number" min="1" max={max} step="1" value={amount} onChange={event => setAmount(event.target.value)} required disabled={!!posts.busy} /></label>
        <label>Unit<select value={unit} onChange={event => { setUnit(event.target.value as 'days' | 'hours'); setAmount('2') }} disabled={!!posts.busy}><option value="days">Days</option><option value="hours">Hours</option></select></label>
      </div>
      <p className="post-meta">1 hour to 7 days. Times use your local time zone.</p>
      <label>Starts<select value={start} onChange={event => setStart(event.target.value as 'now' | 'later')} disabled={!!posts.busy}><option value="now">Now</option><option value="later">Choose date and time</option></select></label>
      {start === 'later' && <label>Start date and time<input type="datetime-local" value={startsAt} min={localDate(now)} max={localDate(maxStart)} onChange={event => setStartsAt(event.target.value)} required disabled={!!posts.busy} /></label>}
      <fieldset disabled={!!posts.busy}><legend>Post to assign</legend><div className="post-options">{available.map(group => <label key={group}><input type="checkbox" checked={validGroups.includes(group)} onChange={event => setGroups(current => event.target.checked ? [...current, group] : current.filter(value => value !== group))} />{post(group)}</label>)}</div></fieldset>
      <p className="post-meta">Only your own posts can be assigned. Personal documents stay private. Assigning to the same colleague replaces their current cover.</p>
      <button className="btn btn-primary w-full" disabled={!!posts.busy || posts.loading || !validGroups.length}>{posts.busy === 'assign' ? 'Assigning…' : 'Assign post'}</button>
    </form> : !posts.loading && posts.me && <p className="post-meta mt-4">Nothing to assign. Borrowed posts cannot be assigned onwards.</p>}
    <section className="mt-7" aria-label="Assigned by me"><h3 className="text-[15px] font-medium">Assigned by me</h3>
      {posts.list?.given.length ? <CoverList covers={posts.list.given} posts={posts} /> : <p className="post-meta mt-2">{posts.list ? 'No posts assigned yet.' : 'Assignment history is not available.'}</p>}
    </section>
  </div>
}
