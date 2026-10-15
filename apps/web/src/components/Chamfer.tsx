import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Corners = { tl?: number; tr?: number; br?: number; bl?: number }

// A box whose outline is a hairline with cut corners. The outline is an SVG
// redrawn on resize, so corner cuts stay a fixed size at any box size.
export function Chamfer({
  cut = 14,
  corners,
  fill = 'transparent',
  stroke = 'var(--color-line)',
  className = '',
  style,
  children,
}: {
  cut?: number
  corners?: Corners
  fill?: string
  stroke?: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const c = { tl: cut, tr: cut, br: cut, bl: cut, ...corners }
  const o = 0.5 // half-pixel offset keeps 1px lines crisp
  const points = [
    [c.tl, o], [w - c.tr, o], [w - o, c.tr], [w - o, h - c.br],
    [w - c.br, h - o], [c.bl, h - o], [o, h - c.bl], [o, c.tl],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ')

  return (
    <div ref={ref} className={`relative ${className}`} style={style}>
      {w > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <polygon points={points} fill={fill} stroke={stroke} strokeWidth="1" />
        </svg>
      )}
      <div className="relative h-full">{children}</div>
    </div>
  )
}
