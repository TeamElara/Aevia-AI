import type { ReactNode } from 'react'

// Splits a line into words that each rise out of a mask, counting on from `from`.
function Words({ text, from }: { text: string; from: number }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span key={i}>
          <span className="w">
            <span style={{ ['--k' as string]: from + i }}>{word}</span>
          </span>{' '}
        </span>
      ))}
    </>
  )
}

// The header each monitoring view opens with: a small label, a two-tone
// headline, and a short note (or controls) under it.
export function Masthead({
  label,
  title,
  muted,
  count,
  children,
}: {
  label: string
  title: string
  muted?: string
  count?: number
  children?: ReactNode
}) {
  const lead = title.split(' ').length
  return (
    <section className="pt-8 sm:pt-14">
      <p className="label stg flex items-center gap-2.5" style={{ ['--i' as string]: 0 }}>
        {label}
        {count != null && <span className="rounded-full bg-surface-2 px-2 py-0.5 tracking-normal text-muted">{count}</span>}
      </p>
      <h1 className="display mt-3 max-w-[22ch] text-[clamp(30px,3.6vw,46px)]">
        <Words text={title} from={0} />
        {muted && (
          <em>
            <Words text={muted} from={lead} />
          </em>
        )}
      </h1>
      {children && (
        <div className="stg mt-4 max-w-[60ch] text-[14.5px] leading-relaxed text-muted" style={{ ['--i' as string]: 3 }}>
          {children}
        </div>
      )}
    </section>
  )
}
