import { flushSync } from 'react-dom'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Runs a state change inside a native view transition when the browser has
// one and motion is welcome; otherwise just runs it.
export function withTransition(update: () => void) {
  if (!document.startViewTransition || reducedMotion()) {
    update()
    return null
  }
  const vt = document.startViewTransition(() => flushSync(update))
  // A newer transition skips this one; that is expected, not an error.
  const ignore = () => undefined
  vt.ready.catch(ignore)
  vt.finished.catch(ignore)
  vt.updateCallbackDone.catch(ignore)
  return vt
}

// Gateway tokens look like [AADHAAR_K7Q2], [PAN_3XJM] or [SECRET_…].
export const TOKEN = /(\[[A-Z][A-Z0-9]*_[A-Za-z0-9…]+\])/
