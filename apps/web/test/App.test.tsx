// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatResponse } from '../src/api/contract'

const api = vi.hoisted(() => ({ chat: vi.fn(), login: vi.fn(), pollApprovalResult: vi.fn() }))
vi.mock('../src/api/client', () => api)
vi.mock('../src/lib/useActingPosts', () => ({ useActingPosts: () => ({ me: null, list: null, loading: false, error: null, busy: null, refresh: vi.fn(), assign: vi.fn(), end: vi.fn() }) }))
vi.mock('../src/components/ChatPanel', () => ({
  ChatPanel: ({ ready, turns, onSend }: { ready: boolean; turns: { prompt: string }[]; onSend: (text: string) => void }) => (
    <div>
      <button disabled={!ready} onClick={() => onSend('test message')}>Send test message</button>
      <p>{turns.map(t => t.prompt).join(',')}</p>
    </div>
  ),
}))
// The real sign-in dialog animates its tick before picking; the test picks at once.
vi.mock('../src/components/SignIn', () => ({
  SignIn: ({ onPick }: { onPick: (id: string) => void }) => <button onClick={() => onPick('ravi')}>Ravi Menon</button>,
}))
vi.mock('../src/components/Field', () => ({ Field: () => null }))
vi.mock('../src/components/PayloadCard', () => ({ PayloadCard: () => null }))
vi.mock('../src/views/ApprovalsView', () => ({ ApprovalsView: () => null }))
vi.mock('../src/views/EvalView', () => ({ EvalView: () => null }))
vi.mock('../src/views/IncidentsView', () => ({ IncidentsView: () => null }))
vi.mock('../src/views/OverviewView', () => ({ OverviewView: () => null }))
import App from '../src/App'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
const reply = (conversation_id: string): ChatResponse => ({
  request_id: crypto.randomUUID(), conversation_id, answer: 'A reply', action: 'allow', reason: null,
  rule_ids: [], findings: [], stage_ms: {}, sent_to_model: 'test message', provider_calls: 1, citations: [],
})

describe('chat response ownership', () => {
  let container: HTMLDivElement, root: Root
  const click = async (label: string) => {
    const button = [...container.querySelectorAll('button')].find(b => b.textContent?.includes(label))
    expect(button, label).toBeDefined()
    await act(async () => { button!.click() })
  }
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    api.chat.mockReset()
    api.login.mockReset().mockImplementation(async (user: string) => ({ token: user + '-token', backend: 'live' }))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root.render(<React.StrictMode><App /></React.StrictMode>) })
  })
  afterEach(async () => {
    await act(async () => { root.unmount() })
    container.remove()
    vi.unstubAllGlobals()
  })

  it('does not forward Asha’s late conversation ID with Ravi’s token', async () => {
    const old = deferred<ChatResponse>()
    api.chat.mockReturnValueOnce(old.promise).mockResolvedValue(reply('ravi-conversation'))
    await click('Send test message')
    await click('Ravi Menon')
    await act(async () => { old.resolve(reply('asha-conversation')) })
    await click('Send test message')
    expect(api.chat).toHaveBeenLastCalledWith('live', 'ravi-token', { conversation_id: null, message: 'test message' })
  })

  it('offers a retry when sign-in fails and enables sending after recovery', async () => {
    api.login.mockRejectedValueOnce(new Error('Gateway unavailable'))
    await click('Ravi Menon')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not connect')
    expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Send test message')?.disabled).toBe(true)
    await click('Retry connection')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Send test message')?.disabled).toBe(false)
  })

  it('does not overwrite Ravi’s established conversation when Asha finishes later', async () => {
    const old = deferred<ChatResponse>()
    api.chat.mockReturnValueOnce(old.promise).mockResolvedValue(reply('ravi-conversation'))
    await click('Send test message')
    await click('Ravi Menon')
    await click('Send test message')
    await act(async () => { old.resolve(reply('asha-conversation')) })
    await click('Send test message')
    expect(api.chat).toHaveBeenLastCalledWith('live', 'ravi-token', { conversation_id: 'ravi-conversation', message: 'test message' })
  })

  it('keeps New chat fresh if a response from the discarded chat arrives late', async () => {
    const old = deferred<ChatResponse>()
    api.chat.mockReturnValueOnce(old.promise).mockResolvedValue(reply('new-conversation'))
    await click('Send test message')
    await click('New chat')
    await act(async () => { old.resolve(reply('discarded-conversation')) })
    await click('Send test message')
    expect(api.chat).toHaveBeenLastCalledWith('live', 'asha-token', { conversation_id: null, message: 'test message' })
  })

  it('retains the latest conversation when an older discarded chat completes afterwards', async () => {
    const old = deferred<ChatResponse>()
    api.chat.mockReturnValueOnce(old.promise).mockResolvedValue(reply('new-conversation'))
    await click('Send test message')
    await click('New chat')
    await click('Send test message')
    await act(async () => { old.resolve(reply('discarded-conversation')) })
    await click('Send test message')
    expect(api.chat).toHaveBeenLastCalledWith('live', 'asha-token', { conversation_id: 'new-conversation', message: 'test message' })
  })
})
