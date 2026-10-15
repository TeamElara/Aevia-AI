import type { Action } from '../api/contract'

export type Tone = 'idle' | 'ok' | 'mask' | 'stop' | 'hold'

// The colour family each gateway verdict shows in.
export const toneOf = (action: Action | undefined): Tone => {
  switch (action) {
    case undefined:
      return 'idle'
    case 'allow':
      return 'ok'
    case 'warn':
    case 'mask':
    case 'redact':
    case 'quarantine':
      return 'mask'
    case 'require_approval':
      return 'hold'
    default:
      return 'stop'
  }
}

// Same idea for places that only know the label and whether it stopped.
export const toneOfLabel = (label: string, stop: boolean): Tone =>
  stop ? 'stop' : label === 'ALLOWED' ? 'ok' : label === 'PENDING APPROVAL' ? 'hold' : 'mask'

export const toneVar: Record<Tone, string> = {
  idle: 'var(--color-accent)',
  ok: 'var(--color-ok)',
  mask: 'var(--color-mask)',
  stop: 'var(--color-stop)',
  hold: 'var(--color-hold)',
}
