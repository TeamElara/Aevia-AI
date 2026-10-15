// Sparse specks behind the console. Seeded so the layout is the same on every
// load and never shifts between renders.

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const rand = seeded(42)
const stars = Array.from({ length: 90 }, (_, i) => ({
  id: i,
  x: rand() * 100,
  y: rand() * 100,
  size: rand() < 0.85 ? 1 : 2,
  opacity: 0.15 + rand() * 0.6,
  delay: rand() * 6,
  twinkle: rand() < 0.3,
}))

export function Starfield() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.id}
          className={`absolute rounded-full bg-white ${s.twinkle ? 'animate-twinkle' : ''}`}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
