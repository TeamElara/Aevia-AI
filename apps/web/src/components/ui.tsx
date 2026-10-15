import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { reducedMotion, TOKEN, withTransition } from '../lib/motion'
import type { Tone } from '../lib/tone'
import { useSlider } from '../lib/useSlider'

export function Arrow() {
  return (
    <span className="arr" aria-hidden="true">
      →
    </span>
  )
}

// Small stroke icons, drawn on a 24px grid.
const paths = {
  chat: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  check: 'M4 12.5 9.5 18 20 6.5',
  plus: 'M12 5v14M5 12h14',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  menu: 'M4 7h16M4 12h16M4 17h10',
  close: 'M6 6l12 12M18 6 6 18',
  up: 'M12 19V5M6 11l6-6 6 6',
  chevron: 'M8 10l4 4 4-4',
  shield: 'M12 3 4.5 6v5.5c0 4.7 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.8 7.5-9.5V6z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
} as const

export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className || 'h-[18px] w-[18px]'}
    >
      <path d={paths[name]} />
    </svg>
  )
}

// The gateway's face. Its colour follows the last verdict; it spins faster
// while a request is checked, rings out when a verdict lands, and the big one
// leans toward the pointer.
export function Orb({
  tone,
  busy,
  size,
  pulseKey,
  anchor,
  follow,
}: {
  tone: Tone
  busy?: boolean
  size: number
  pulseKey?: string | number
  anchor?: boolean
  follow?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!follow || !el || reducedMotion()) return
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const clamp = (v: number) => Math.max(-1, Math.min(1, v))
      el.style.setProperty('--px', String(clamp((e.clientX - (r.left + r.width / 2)) / 500)))
      el.style.setProperty('--py', String(clamp((e.clientY - (r.top + r.height / 2)) / 500)))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [follow])
  return (
    <span
      ref={ref}
      data-tone={tone}
      data-busy={busy ? 'true' : undefined}
      data-orb-anchor={anchor ? '' : undefined}
      className={`orb-wrap ${size < 40 ? 'sm' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="orb">
        <span className="swirl" />
        <span className="swirl" />
        <span className="shine" />
      </span>
      {size >= 60 && <span className="orb-shadow" />}
      {pulseKey != null && (
        <Fragment key={pulseKey}>
          <span className="ripple" />
          <span className="ripple" />
          <span className="ripple" />
        </Fragment>
      )}
    </span>
  )
}

// Leans its child toward the pointer a little, and springs back on leave.
export function Magnetic({ children, strength = 0.25, className = '' }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const move = (e: ReactPointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse' || reducedMotion()) return
    const r = el.getBoundingClientRect()
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`
  }
  const leave = () => {
    if (ref.current) ref.current.style.transform = ''
  }
  return (
    <span
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      className={`inline-block transition-transform duration-500 [transition-timing-function:var(--ease-spring)] ${className}`}
    >
      {children}
    </span>
  )
}

// Plain text with gateway tokens shown as pills. Text nodes only, never HTML.
export function Tokens({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) =>
        i % 2 ? (
          <span key={i} className="tok">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

// Plain text that arrives word by word, tokens as pills. Text nodes only.
export function Reveal({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) return <Tokens text={text} />
  const parts = text.split(/(\s+)/)
  let n = 0
  return (
    <>
      {parts.map((part, i) => {
        if (!part.trim()) return <Fragment key={i}>{part}</Fragment>
        const k = Math.min(n++, 110)
        return (
          <span key={i} className="word" style={{ ['--n' as string]: k }}>
            {TOKEN.test(part) ? <Tokens text={part} /> : part}
          </span>
        )
      })}
    </>
  )
}

export function Segmented<T extends string | number | boolean>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly (readonly [string, NoInfer<T>])[]
  value: T
  onChange: (v: NoInfer<T>) => void
  label: string
}) {
  const [ref, style] = useSlider(value)
  return (
    <div ref={ref} className="seg" role="group" aria-label={label}>
      <span className="ind" style={style} aria-hidden="true" />
      {options.map(([text, v]) => (
        <button key={String(v)} data-on={v === value} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

// Closes on Escape and returns focus to whatever opened it.
function useDismiss(open: boolean, onClose: () => void, panel: RefObject<HTMLElement | null>) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    panel.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, panel])
}

export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(open, onClose, panel)
  if (!open) return null
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center p-4">
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="card pointer-events-auto max-h-[calc(100vh-32px)] w-full max-w-[460px] animate-pop overflow-y-auto shadow-[var(--shadow-lg)]"
        >
          {children}
        </div>
      </div>
    </>
  )
}

export function Drawer({
  open,
  onClose,
  label,
  side = 'right',
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  side?: 'left' | 'right'
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(open, onClose, panel)
  if (!open) return null
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`fixed inset-y-0 z-[70] flex w-[min(440px,92vw)] flex-col overflow-y-auto bg-paper shadow-[var(--shadow-lg)] ${
          side === 'right'
            ? 'right-0 animate-[slide-in_450ms_var(--ease-soft)_both] border-l border-line'
            : 'left-0 animate-[slide-in-left_400ms_var(--ease-soft)_both] border-r border-line'
        }`}
      >
        {children}
      </div>
    </>
  )
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="toast" role="status">
      {children}
    </div>
  )
}

// Flips the theme; the new one is revealed by a circle growing from the button.
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark')
  const btn = useRef<HTMLButtonElement>(null)
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    const apply = () => {
      root.dataset.theme = next
      setTheme(next)
    }
    try {
      localStorage.setItem('leakshield-theme', next)
    } catch {
      // Private windows may refuse storage; the theme still applies for this visit.
    }
    root.dataset.vt = 'theme'
    const vt = withTransition(apply)
    if (!vt) {
      delete root.dataset.vt
      return
    }
    const r = btn.current!.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    vt.ready.then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 750, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    vt.finished.finally(() => delete root.dataset.vt)
  }
  return (
    <button ref={btn} className="icon-btn" onClick={flip} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
      <span key={theme} className="pop-in">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </span>
    </button>
  )
}
