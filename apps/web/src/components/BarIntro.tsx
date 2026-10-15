import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reducedMotion } from '../lib/motion'

// Plays once per page load: an orb lights up, a ray runs into it and fans out,
// then the light folds into a seam that opens into the message bar.
let played = false
const LENGTH = 3700
const STRANDS = [6, 27, 50, 73, 94]

type Stage = 'wait' | 'play' | 'done'

export function BarIntro({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>(() =>
    played || typeof IntersectionObserver === 'undefined' || reducedMotion() ? 'done' : 'wait')
  const [size, setSize] = useState({ w: 960, h: 150 })
  const root = useRef<HTMLDivElement>(null)

  // Wait until the bar is on screen, so the intro is never played to nobody.
  useEffect(() => {
    const el = root.current
    if (stage !== 'wait' || !el) return
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      played = true
      setSize({ w: entry.boundingClientRect.width, h: entry.boundingClientRect.height })
      setStage('play')
      seen.disconnect()
    }, { threshold: 0.3 })
    seen.observe(el)
    return () => seen.disconnect()
  }, [stage])

  // Any click or key on the bar skips straight to the end.
  useEffect(() => {
    const el = root.current
    if (stage !== 'play' || !el) return
    const finish = () => setStage('done')
    const timer = window.setTimeout(finish, LENGTH)
    el.addEventListener('pointerdown', finish)
    el.addEventListener('keydown', finish)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('pointerdown', finish)
      el.removeEventListener('keydown', finish)
    }
  }, [stage])

  // The strands span the right half of the bar, a little taller than it.
  const w = size.w / 2
  const h = size.h * 1.2
  return (
    <div ref={root} className="bar-intro" data-stage={stage}>
      {children}
      {stage === 'play' && (
        <div className="intro" aria-hidden="true">
          <span className="intro-ray" />
          <svg className="intro-strands" viewBox={`0 0 ${w} ${h}`}>
            {STRANDS.map((y, i) => (
              <path key={y} d={`M0 ${h / 2} C ${w * 0.34} ${h / 2}, ${w * 0.52} ${h / 2}, ${w} ${(h * y) / 100}`} pathLength={1} style={{ animationDelay: `calc(var(--t0) + ${1150 + i * 70}ms)` }} />
            ))}
          </svg>
          <span className="intro-seam" />
          <span className="intro-orb" />
        </div>
      )}
    </div>
  )
}
