import { useEffect, useRef, useState } from 'react'

// Synthetic values only. Each one drifts into the lens as typed and leaves as
// the token the model would receive.
const lanes = [
  { y: 190, chips: [['Aadhaar 2345 6789 0124', '[AADHAAR_K7Q2]'], ['IFSC HDFC0001234', '[IFSC_2D8K]']] },
  { y: 270, chips: [['PAN ABCPE1234F', '[PAN_3XJM]'], ['+91 98765 43210', '[PHONE_7H1C]']] },
  { y: 350, chips: [['AWS_KEY=AKIA…EXAMPLE', '[SECRET_9F2A]'], ['UPI asha@okbank', '[UPI_4M6R]']] },
] as const

const CX = 280
const CY = 270
const R = 132
const CYCLE = 9

// A stippled sphere, lit from the upper left, drawn as one path. Seeded so it
// looks the same on every render.
function stipple() {
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const light = [-0.5, -0.62, 0.6]
  const len = Math.hypot(...light)
  let d = ''
  for (let i = 0; i < 3400; i++) {
    const rr = R * Math.sqrt(rand())
    const th = rand() * Math.PI * 2
    const x = rr * Math.cos(th)
    const y = rr * Math.sin(th)
    const z = Math.sqrt(Math.max(0, 1 - (rr / R) ** 2))
    const lit = Math.max(0, ((x / R) * light[0] + (y / R) * light[1] + z * light[2]) / len)
    if (rand() > 0.06 + 0.8 * (1 - lit) ** 1.6) continue
    const s = (0.7 + rand() * 0.7).toFixed(2)
    d += `M${(CX + x - +s).toFixed(1)} ${(CY + y).toFixed(1)}a${s} ${s} 0 1 0 ${2 * +s} 0a${s} ${s} 0 1 0 ${-2 * +s} 0`
  }
  return d
}
const dots = stipple()

function Chip({ text, mono }: { text: string; mono?: boolean }) {
  const w = text.length * (mono ? 6.7 : 6.2) + 22
  return (
    <>
      <rect x={-w / 2} y={-13} width={w} height={26} rx={13} />
      <text textAnchor="middle" dy="0.35em">
        {text}
      </text>
    </>
  )
}

// What the gateway does, drawn: private values go in, tokens come out.
export function GatewayLens() {
  const root = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = root.current
    if (!el) return
    let inViewport = true
    const update = () => setVisible(inViewport && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting
      update()
    })
    observer.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return (
    <div ref={root} className="lens-scene" data-paused={paused || !visible}>
      <svg
        className="lens-art"
        viewBox="0 0 560 520"
        role="img"
        aria-label="Private values such as an Aadhaar or PAN number pass through the gateway and come out as tokens like [AADHAAR_K7Q2]."
      >
        <defs>
          <clipPath id="lens-clip">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
          <linearGradient id="lens-scan" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        <text className="lens-caption" x={70} y={92} textAnchor="middle">
          you type
        </text>
        <text className="lens-caption" x={CX} y={92} textAnchor="middle">
          gateway
        </text>
        <text className="lens-caption" x={490} y={92} textAnchor="middle">
          model sees
        </text>

        <g className="lens-body">
          <ellipse className="lens-ring ring-a" cx={CX} cy={CY} rx={R + 58} ry={44} transform={`rotate(-16 ${CX} ${CY})`} />
          <path className="lens-dots" d={dots} />
          <g clipPath="url(#lens-clip)">
            <rect className="lens-scan" x={CX - R} y={CY - R - 40} width={R * 2} height={80} fill="url(#lens-scan)" />
          </g>
          <circle className="lens-edge" cx={CX} cy={CY} r={R} />
          <ellipse className="lens-ring ring-b" cx={CX} cy={CY} rx={R + 30} ry={R + 30} />
        </g>

        {lanes.map((lane, li) =>
          lane.chips.map(([raw, token], ci) => {
            const delay = `${-((li * 3 + ci * 4.5) % CYCLE)}s`
            return (
              <g key={raw}>
                <circle className="lens-pulse" cx={CX} cy={CY} r={R} style={{ animationDelay: delay }} />
                <g transform={`translate(0 ${lane.y})`}>
                  <g className="lens-chip" data-rest={ci ? 'out' : 'in'} style={{ animationDelay: delay }}>
                    <g className="chip-raw" style={{ animationDelay: delay }}>
                      <Chip text={raw} />
                    </g>
                    <g className="chip-token" style={{ animationDelay: delay }}>
                      <Chip text={token} mono />
                    </g>
                  </g>
                </g>
              </g>
            )
          }),
        )}
      </svg>
      <button
        className="motion-toggle"
        onClick={() => setPaused((v) => !v)}
        aria-pressed={paused}
        aria-label={paused ? 'Play illustration animation' : 'Pause illustration animation'}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          {paused ? <path d="M3 1.5 10 6 3 10.5Z" fill="currentColor" /> : <path d="M3 2v8M8 2v8" stroke="currentColor" strokeWidth="2" />}
        </svg>
        {paused ? 'Play motion' : 'Pause motion'}
      </button>
    </div>
  )
}
