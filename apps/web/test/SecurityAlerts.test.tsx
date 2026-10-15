// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecurityInbox, SecuritySession } from '../src/api/security'

const api = vi.hoisted(() => ({ getSecurityAlerts: vi.fn(), acknowledgeSecurityAlert: vi.fn() }))
vi.mock('../src/api/security', () => api)
import { useSecurityAlerts } from '../src/lib/useSecurityAlerts'

const session = (id: string): SecuritySession => ({ token: `${id}-token`, backend: 'live' })
const inbox = (subject = '', reviewer = false): SecurityInbox => ({ enabled: true, can_review_all: reviewer, scope: 'assigned',
  alerts: subject ? [{ id: 'alert', subject_id: subject, kind: 'prompt_manipulation', level: 1, attempts: 3,
    created_at: '2026-10-16T00:00:00Z', window_start: '2026-10-15T23:45:00Z', window_end: '2026-10-16T00:00:00Z', acknowledged_at: null }] : [] })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
function Probe({ owner }: { owner: SecuritySession }) {
  const warnings = useSecurityAlerts(owner)
  return <div>
    <p>{warnings.data?.alerts.map(a => `${a.subject_id}:${a.acknowledged_at ? 'ack' : 'open'}`).join(',') ?? 'empty'}</p>
    <p>{warnings.scope} {warnings.busy ?? 'idle'}</p>
    <button onClick={() => warnings.setScope('oversight')}>Oversight</button>
    <button onClick={() => void warnings.acknowledge('alert')}>Acknowledge</button>
  </div>
}
describe('security inbox identity boundaries', () => {
  let root: Root, container: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    api.getSecurityAlerts.mockReset(); api.acknowledgeSecurityAlert.mockReset();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove() });
  const render = async (owner: string) => act(async () => root.render(<Probe owner={session(owner)} />));
  const click = async (name: string) => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === name)!.click());
  it('discards Ravi’s late inbox after switching to Meera, using the selected token', async () => {
    const old = deferred<SecurityInbox>();
    api.getSecurityAlerts.mockImplementation((owner: SecuritySession) => owner.token === 'ravi-token' ? old.promise : Promise.resolve(inbox()));
    await render('ravi'); await render('meera');
    await act(async () => old.resolve(inbox('asha')));
    expect(container.textContent).not.toContain('asha');
    expect(api.getSecurityAlerts).toHaveBeenLastCalledWith(session('meera'), 'assigned', expect.any(AbortSignal));
  });
  it('does not apply Ravi’s late acknowledgement to Meera’s alert', async () => {
    const old = deferred<{ id: string; acknowledged_at: string }>();
    api.getSecurityAlerts.mockImplementation((owner: SecuritySession) => Promise.resolve(inbox(owner.token === 'ravi-token' ? 'asha' : 'ravi')));
    api.acknowledgeSecurityAlert.mockReturnValue(old.promise);
    await render('ravi'); await click('Acknowledge'); await render('meera');
    await act(async () => old.resolve({ id: 'alert', acknowledged_at: '2026-10-16T00:01:00Z' }));
    expect(container.textContent).toContain('ravi:open'); expect(container.textContent).not.toContain('asha');
    expect(container.textContent).toContain('idle');
  });
  it('resets oversight scope on identity change instead of requesting another user’s privileged inbox', async () => {
    api.getSecurityAlerts.mockResolvedValue(inbox('', true));
    await render('ceo'); await click('Oversight'); await render('asha');
    expect(api.getSecurityAlerts).toHaveBeenLastCalledWith(session('asha'), 'assigned', expect.any(AbortSignal));
    expect(container.textContent).toContain('assigned');
  });
  it('uses the selected account, acknowledges locally, and does not log in as admin', async () => {
    api.getSecurityAlerts.mockResolvedValue(inbox('asha'));
    api.acknowledgeSecurityAlert.mockResolvedValue({ id: 'alert', acknowledged_at: '2026-10-16T00:01:00Z' });
    await render('ravi'); await click('Acknowledge');
    expect(api.acknowledgeSecurityAlert).toHaveBeenCalledWith(session('ravi'), 'alert');
    expect(container.textContent).toContain('asha:ack');
  });
});
