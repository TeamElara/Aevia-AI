import { useEffect, useRef } from 'react'
import { reducedMotion } from '../lib/motion'
import type { Tone } from '../lib/tone'

const rgb: Record<Tone, [number, number, number]> = {
  idle: [111, 107, 234],
  ok: [23, 166, 115],
  mask: [232, 150, 15],
  stop: [229, 64, 79],
  hold: [124, 79, 240],
}

type Dot = { x: number; y: number; vx: number; vy: number; r: number; a: number; phase: number; fade: number }
type Spark = { x: number; y: number; vx: number; vy: number; r: number; life: number }

// A quiet field of motes behind the chat. They drift and shy away from the
// pointer; while a message is checked they spiral into the orb, and when a
// verdict lands they burst out in its colour. Decorative only.
export function Field({ tone, busy, burstKey }: { tone: Tone; busy: boolean; burstKey?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef({ tone, busy })
  const sparks = useRef<Spark[]>([])
  const kick = useRef(0)

  useEffect(() => {
    live.current = { tone, busy }
  }, [tone, busy])

  // A new verdict: queue a burst for the next frame.
  useEffect(() => {
    if (burstKey) kick.current += 1
  }, [burstKey])

  useEffect(() => {
    const el = canvas.current
    if (!el || reducedMotion()) return
    const ctx = el.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let dots: Dot[] = []
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const pointer = { x: -9999, y: -9999 }
    const color = [...rgb[live.current.tone]]
    let seenKick = kick.current
    let raf = 0

    const spawn = (anywhere: boolean): Dot => {
      const edge = Math.random() * 4
      const far = anywhere
        ? { x: Math.random() * w, y: Math.random() * h }
        : edge < 1
          ? { x: Math.random() * w, y: -10 }
          : edge < 2
            ? { x: w + 10, y: Math.random() * h }
            : edge < 3
              ? { x: Math.random() * w, y: h + 10 }
              : { x: -10, y: Math.random() * h }
      return { ...far, vx: 0, vy: 0, r: 0.6 + Math.random() * 1.3, a: 0.25 + Math.random() * 0.55, phase: Math.random() * 6.28, fade: anywhere ? 1 : 0 }
    }

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      el.width = w * dpr
      el.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.max(40, Math.min(120, Math.round((w * h) / 16000)))
      dots = Array.from({ length: n }, () => spawn(true))
    }

    const anchor = () => {
      const all = document.querySelectorAll<HTMLElement>('[data-orb-anchor]')
      const a = all[all.length - 1]
      if (!a) return { x: w / 2, y: h * 0.3 }
      const r = a.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
    }
    const onLeave = () => {
      pointer.x = pointer.y = -9999
    }

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const { tone: tn, busy: isBusy } = live.current
      const target = rgb[tn]
      for (let i = 0; i < 3; i++) color[i] += (target[i] - color[i]) * 0.04
      const [cr, cg, cb] = color.map(Math.round)
      const o = anchor()

      // Verdict landed: throw sparks and push nearby motes outward.
      if (kick.current !== seenKick) {
        seenKick = kick.current
        for (let i = 0; i < 56; i++) {
          const ang = Math.random() * Math.PI * 2
          const sp = 1.6 + Math.random() * 5
          sparks.current.push({ x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 0.8 + Math.random() * 1.8, life: 1 })
        }
        for (const d of dots) {
          const dx = d.x - o.x
          const dy = d.y - o.y
          const dist = Math.hypot(dx, dy) || 1
          if (dist < 340) {
            const f = 4 * (1 - dist / 340)
            d.vx += (dx / dist) * f
            d.vy += (dy / dist) * f
          }
        }
      }

      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i]
        const dx = o.x - d.x
        const dy = o.y - d.y
        const dist = Math.hypot(dx, dy) || 1
        if (isBusy) {
          // Spiral in: pull toward the orb plus a sideways swirl.
          const pull = 0.06 + 18 / (dist + 60)
          d.vx += (dx / dist) * pull - (dy / dist) * 0.05
          d.vy += (dy / dist) * pull + (dx / dist) * 0.05
          if (dist < 14) dots[i] = spawn(false)
        } else {
          d.vx += (Math.random() - 0.5) * 0.03 - (dy / dist) * 0.0025
          d.vy += (Math.random() - 0.5) * 0.03 + (dx / dist) * 0.0025
          if (dist < 70) {
            d.vx -= (dx / dist) * 0.05
            d.vy -= (dy / dist) * 0.05
          }
        }
        const px = d.x - pointer.x
        const py = d.y - pointer.y
        const pd = Math.hypot(px, py)
        if (pd < 120 && pd > 0) {
          d.vx += (px / pd) * 0.35 * (1 - pd / 120)
          d.vy += (py / pd) * 0.35 * (1 - pd / 120)
        }
        d.vx *= isBusy ? 0.94 : 0.965
        d.vy *= isBusy ? 0.94 : 0.965
        d.x += d.vx
        d.y += d.vy
        if (d.x < -20) d.x = w + 20
        if (d.x > w + 20) d.x = -20
        if (d.y < -20) d.y = h + 20
        if (d.y > h + 20) d.y = -20
        d.fade = Math.min(1, d.fade + 0.02)
      }

      // Faint threads between close neighbours.
      ctx.lineWidth = 0.6
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i]
          const b = dots[j]
          const dd = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
          if (dd < 8100) {
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.1 * (1 - dd / 8100) * Math.min(a.fade, b.fade)})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const d of dots) {
        const tw = 0.65 + 0.35 * Math.sin(t / 900 + d.phase)
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${d.a * tw * d.fade})`
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, 6.283)
        ctx.fill()
      }

      const next: Spark[] = []
      for (const s of sparks.current) {
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.955
        s.vy *= 0.955
        s.life *= 0.968
        if (s.life < 0.03) continue
        next.push(s)
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${s.life})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r * (0.6 + s.life * 0.6), 0, 6.283)
        ctx.fill()
      }
      sparks.current = next
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas ref={canvas} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
}
