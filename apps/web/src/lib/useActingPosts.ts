import { useCallback, useEffect, useState } from 'react'
import { assignPost, endPost, getMyPosts, getPosts, postError, type MyPosts, type PostGrant, type PostList, type PostSession } from '../api/delegations'

type State = { token: string; me: MyPosts | null; list: PostList | null; loading: boolean; error: string | null; busy: string | null }
const empty = (token = ''): State => ({ token, me: null, list: null, loading: !!token, error: null, busy: null })

// Share one employee snapshot between the sidebar, modal and chat header.
// A token boundary prevents late reads/mutations from leaking into another user.
export function useActingPosts(session: PostSession | null) {
  const token = session?.token ?? ''
  const backend = session?.backend
  const [state, setState] = useState<State>(() => empty())
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(v => v + 1), [])
  useEffect(() => {
    window.addEventListener('acting-posts-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('acting-posts-changed', refresh); window.removeEventListener('focus', refresh) }
  }, [refresh])
  useEffect(() => {
    if (!token || !backend) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    setState(previous => previous.token === token ? previous : empty(token))
    const load = async () => {
      try {
        const [me, list] = await Promise.all([getMyPosts({ token, backend }, controller.signal), getPosts({ token, backend }, controller.signal)])
        if (controller.signal.aborted) return
        setState(previous => ({ ...previous, token, me, list, loading: false, error: null }))
        // Refresh exactly at a start/expiry boundary, otherwise every ten seconds.
        const boundaries = [...list.given, ...list.received, ...(list.active ?? [])].flatMap(c => [Date.parse(c.starts_at), Date.parse(c.expires_at)]).filter(at => at > Date.now())
        const delay = Math.max(100, Math.min(10_000, ...boundaries.map(at => at - Date.now())))
        timer = setTimeout(load, delay)
      } catch (error) {
        if (controller.signal.aborted) return
        // Never retain a stale access badge after an unsuccessful refresh.
        setState(previous => ({ ...previous, token, me: null, list: null, loading: false, error: postError(error) }))
        if (backend !== 'mock') timer = setTimeout(load, 10_000)
      }
    }
    void load()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [token, backend, version])

  const mutate = async (id: string, action: (owner: PostSession) => Promise<unknown>) => {
    if (!session) return false
    const owner = session
    setState(previous => previous.token === owner.token ? { ...previous, busy: id, error: null } : previous)
    try {
      await action(owner)
      window.dispatchEvent(new Event('acting-posts-changed'))
      return true
    } catch (error) {
      setState(previous => previous.token === owner.token ? { ...previous, error: postError(error) } : previous)
      return false
    } finally {
      setState(previous => previous.token === owner.token ? { ...previous, busy: null } : previous)
    }
  }
  return {
    ...(state.token === token ? state : empty(token)), refresh,
    assign: (grant: PostGrant) => mutate('assign', owner => assignPost(owner, grant)),
    end: (id: string) => mutate(id, owner => endPost(owner, id)),
  }
}
export type ActingPosts = ReturnType<typeof useActingPosts>
