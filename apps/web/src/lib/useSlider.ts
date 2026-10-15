import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

// Measures the element marked data-on="true" inside the ref, so a highlight
// can slide to it.
export function useSlider(active: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const el = root.querySelector<HTMLElement>('[data-on="true"]')
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [active])
  const style: CSSProperties = box
    ? { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }
    : { opacity: 0 }
  return [ref, style] as const
}
