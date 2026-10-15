// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssignPostModal, CoveringBadge, CoverList } from '../src/components/ActingPosts'
import { Sidebar } from '../src/components/Sidebar'
import { ApprovalsView } from '../src/views/ApprovalsView'
vi.mock('../src/lib/useAdmin', () => { const admin = { token: 'admin-token', backend: 'live' }; return { useAdmin: () => ({ admin, error: null }) } })
import { ApiError } from '../src/api/client'
import { assignPost, coverStatus, endPost, getMyPosts, getPosts, postError, type Cover, type MyPosts } from '../src/api/delegations'
import { useActingPosts, type ActingPosts } from '../src/lib/useActingPosts'

const employee = { token: 'ravi-token', backend: 'live' as const }
const me = (id = 'ravi', groups = ['hr']): MyPosts => ({ id, own_groups: ['employee', ...groups], groups: ['employee', ...groups], delegated_groups: [], lendable_groups: groups, covering: [], max_hours: 168 })
const cover = (changes: Partial<Cover> = {}): Cover => ({ id: 'cover-1', from: 'ravi', to: 'asha', groups: ['hr'], starts_at: new Date(Date.now() - 60000).toISOString(), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), revoked_at: null, status: 'active', active: true, ...changes })
const posts = (changes: Partial<ActingPosts> = {}): ActingPosts => ({ token: 'ravi-token', me: me(), list: { given: [], received: [], max_hours: 168 }, loading: false, error: null, busy: null, refresh: vi.fn(), assign: vi.fn().mockResolvedValue(true), end: vi.fn().mockResolvedValue(true), ...changes })
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
let host: HTMLDivElement, root: Root
async function render(node: React.ReactNode) { await act(async () => root.render(node)) }
function button(text: string) { return [...host.querySelectorAll('button')].find(node => node.textContent === text)! }
async function click(node: HTMLElement) { await act(async () => node.click()) }
async function setValue(node: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(node, value)
    node.dispatchEvent(new Event('change', { bubbles: true }))
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const field = (name: string) => [...host.querySelectorAll('label')].find(label => label.firstChild?.textContent === name)!.querySelector('input,select') as HTMLInputElement | HTMLSelectElement
async function submit() { await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('acting post API', () => {
  it('uses authenticated routes and sends exactly one duration unit', async () => {
    const fetch = vi.fn().mockImplementation(async () => response(cover()))
    vi.stubGlobal('fetch', fetch)
    await getMyPosts(employee); await getPosts(employee)
    await assignPost(employee, { to: 'asha', days: 2, groups: ['hr'] })
    await assignPost(employee, { to: 'asha', hours: 1, starts_at: '2026-11-01T04:00:00.000Z', groups: ['hr'] })
    await endPost(employee, 'id/unsafe')
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/me', '/api/delegations', '/api/delegations', '/api/delegations', '/api/delegations/id%2Funsafe'])
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ to: 'asha', days: 2, groups: ['hr'] })
    expect(JSON.parse(fetch.mock.calls[3][1].body)).not.toHaveProperty('days')
    expect(fetch.mock.calls[4][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer ravi-token' } })
  })
  it.each(['NOTHING_TO_DELEGATE', 'GROUP_NOT_DELEGABLE', 'DELEGATION_LIMIT', 'START_TOO_FAR', 'START_IN_PAST', 'DELEGATE_TO_SELF'])('shows readable English for %s', code => {
    const message = postError(new ApiError(code, 400))
    expect(message).not.toContain(code); expect(message.length).toBeGreaterThan(20)
  })
  it('does not pretend assignments work in the offline mock', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(assignPost({ ...employee, backend: 'mock' }, { to: 'asha', days: 2, groups: ['hr'] })).rejects.toMatchObject({ message: 'DELEGATION_UNAVAILABLE' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('assignment UI', () => {
  it('defaults to two days, offers only lendable posts and excludes self', async () => {
    const state = posts()
    await render(<AssignPostModal open userId="ravi" posts={state} onClose={vi.fn()} />)
    expect((field('Duration') as HTMLInputElement).value).toBe('2')
    expect((field('Unit') as HTMLSelectElement).value).toBe('days')
    expect([...host.querySelectorAll('option')].some(option => option.value === 'ravi')).toBe(false)
    expect([...host.querySelectorAll('input[type="checkbox"]')]).toHaveLength(1)
    await submit()
    expect(state.assign).toHaveBeenCalledWith({ to: 'asha', days: 2, groups: ['hr'] })
  })
  it('sends one-hour scheduled cover in UTC from local date input', async () => {
    const state = posts()
    await render(<AssignPostModal open userId="ravi" posts={state} onClose={vi.fn()} />)
    await setValue(field('Unit'), 'hours'); await setValue(field('Duration'), '1')
    await setValue(field('Starts'), 'later')
    const next = new Date(Date.now() + 86400000)
    const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    await setValue(field('Start date and time'), local); await submit()
    expect(state.assign).toHaveBeenCalledWith({ to: 'asha', hours: 1, groups: ['hr'], starts_at: new Date(local).toISOString() })
  })
  it('rejects invalid durations, past and distant starts before sending', async () => {
    const state = posts()
    await render(<AssignPostModal open userId="ravi" posts={state} onClose={vi.fn()} />)
    await setValue(field('Duration'), '8'); await submit()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('1 to 7')
    await setValue(field('Duration'), '2'); await setValue(field('Starts'), 'later')
    await setValue(field('Start date and time'), '2000-01-01T09:00'); await submit()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('future')
    await setValue(field('Start date and time'), '2099-01-01T09:00'); await submit()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('14 days')
    expect(state.assign).not.toHaveBeenCalled()
  })
  it('disables assignment for Asha even when she is covering a borrowed post', async () => {
    const state = posts({ me: { ...me('asha', []), delegated_groups: ['hr'], groups: ['employee', 'hr'] } })
    await render(<Sidebar user={{ id: 'asha', name: 'Asha Rao', role: 'Employee' }} userIndex={0} view="Chat" tone="idle" backend="live" posts={state} onAssign={vi.fn()} onGo={vi.fn()} onNewChat={vi.fn()} onSignIn={vi.fn()} />)
    expect(button('Nothing to assign').disabled).toBe(true)
  })
  it('shows scheduled/active/ended covers and chooses Cancel or End', async () => {
    const state = posts()
    const rows = [cover({ id: 'scheduled', starts_at: new Date(Date.now() + 60000).toISOString() }), cover(), cover({ id: 'ended', revoked_at: new Date().toISOString() })]
    await render(<CoverList covers={rows} posts={state} />)
    expect([...host.querySelectorAll('.post-status')].map(node => node.textContent)).toEqual(['Scheduled', 'Active', 'Ended'])
    await click(button('Cancel')); expect(state.end).toHaveBeenCalledWith('scheduled')
    await click(button('End')); expect(state.end).toHaveBeenCalledWith('cover-1')
    expect(host.querySelectorAll('button')).toHaveLength(2)
    expect(coverStatus(rows[0], Date.now() + 120000)).toBe('active')
    expect(coverStatus(rows[1], Date.now() + 2 * 86400000)).toBe('ended')
  })
  it('allows a recipient to hand back a cover and hides expired badges', async () => {
    const state = posts()
    await render(<CoveringBadge posts={state} covering={[{ id: 'received', for: 'ravi', groups: ['hr'], until: new Date(Date.now() + 86400000).toISOString() }, { id: 'expired', for: 'ravi', groups: ['hr'], until: '2000-01-01T00:00:00Z' }]} />)
    expect(host.textContent).toContain('Acting HR for Ravi · until')
    expect(host.querySelectorAll('button')).toHaveLength(1)
    await click(button('Hand back')); expect(state.end).toHaveBeenCalledWith('received')
  })
  it('offers End on scheduled admin covers and disables mutations while busy', async () => {
    const state = posts({ busy: 'other' })
    await render(<CoverList covers={[cover({ starts_at: new Date(Date.now() + 60000).toISOString() })]} posts={state} admin />)
    expect(button('End').disabled).toBe(true)
    expect(host.textContent).toContain('Ravi → Asha')
  })
  it('closes on Escape and restores focus to the opener', async () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus()
    const close = vi.fn()
    await render(<AssignPostModal open userId="ravi" posts={posts()} onClose={close} />)
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(close).toHaveBeenCalled()
    await render(<AssignPostModal open={false} userId="ravi" posts={posts()} onClose={close} />)
    expect(document.activeElement).toBe(opener); opener.remove()
  })
})

describe('acting post session ownership', () => {
  it('ignores old account reads after switching users', async () => {
    let resolveOld!: (value: Response) => void
    const old = new Promise<Response>(resolve => { resolveOld = resolve })
    const fetch = vi.fn().mockImplementation((url, options) => options.headers.Authorization === 'Bearer ravi-token' ? old : Promise.resolve(response(url === '/api/me' ? me('asha', []) : { given: [], received: [], max_hours: 168 })))
    vi.stubGlobal('fetch', fetch)
    function Probe({ token }: { token: string }) { const state = useActingPosts({ ...employee, token }); return <p>{state.me?.id ?? 'loading'}:{state.me?.lendable_groups.join(',')}</p> }
    await render(<Probe token="ravi-token" />)
    await render(<Probe token="asha-token" />)
    expect(host.textContent).toBe('asha:')
    await act(async () => resolveOld(response(me())))
    expect(host.textContent).toBe('asha:')
  })
})


describe('admin acting posts', () => {
  it('reads the admin active list and ends a cover with the admin token', async () => {
    const current = cover()
    const fetch = vi.fn().mockImplementation(async (url, options) => {
      if (options.method === 'DELETE') return response({ ...current, status: 'ended', revoked_at: new Date().toISOString() })
      if (url === '/api/me') return response(me('admin', []))
      if (url === '/api/approvals') return response([])
      return response({ given: [], received: [], active: [current], max_hours: 168 })
    })
    vi.stubGlobal('fetch', fetch)
    await render(<ApprovalsView />)
    const section = host.querySelector('[aria-label="Acting posts"]')!
    expect(section.textContent).toContain('Ravi → Asha')
    const end = [...section.querySelectorAll('button')].find(button => button.textContent === 'End')!
    await click(end)
    expect(fetch).toHaveBeenCalledWith('/api/delegations/cover-1', expect.objectContaining({ method: 'DELETE', headers: { Authorization: 'Bearer admin-token' } }))
  })
})
