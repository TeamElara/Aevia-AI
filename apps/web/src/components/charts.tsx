import { useEffect, useRef, useState } from 'react'

// Single-series monochrome charts (one hue, so no legend; the title names the
// series). Thin marks, 4px rounded data-ends, hairline recessive grid, per-mark
// hover/focus readout. Values also appear in a visually hidden table.

const fmt = (n: number) => n.toLocaleString('en-IN')

function niceMax(v: number) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * p * 4 >= v)! * p
  return step * 4
}

export function ColumnChart({
  data,
  label,
  valueLabel,
  height = 168,
}: {
  data: { key: string; label: string; value: number }[]
  label: string
  valueLabel: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max]

  return (
    <figure aria-label={label}>
      <div className="relative flex gap-3" style={{ height }}>
        <div className="relative w-6 shrink-0 font-mono text-[10px] text-faint" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-line-strong' : 'bg-fg/[0.07]'}`}
              style={{ top: `${100 - (t / max) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <div
                key={d.key}
                tabIndex={0}
                aria-label={`${d.label}: ${d.value} ${valueLabel}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
              >
                <div
                  className={`w-full max-w-[10px] origin-bottom animate-[grow_900ms_var(--ease-soft)_both] rounded-t-[4px] transition-colors ${
                    hover === i ? 'bg-accent-2' : 'bg-accent'
                  }`}
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, animationDelay: `${i * 18}ms` }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 animate-msg whitespace-nowrap rounded-[10px] border border-line bg-surface px-3 py-2 shadow-[var(--shadow)]">
                    <p className="text-[13px] font-medium text-fg">
                      {fmt(d.value)} <span className="font-normal text-muted">{valueLabel}</span>
                    </p>
                    <p className="font-mono text-[10px] text-faint">{d.label}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-9 font-mono text-[10px] text-faint" aria-hidden="true">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <SrTable caption={label} rows={data.map((d) => [d.label, d.value])} />
    </figure>
  )
}

export function BarList({
  data,
  label,
}: {
  data: { key: string; label: string; value: number }[]
  label: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  if (!data.length) return <p className="text-[13px] text-faint">No data in this window.</p>
  return (
    <figure aria-label={label} className="space-y-2.5" onMouseLeave={() => setHover(null)}>
      {data.map((d) => (
        <div
          key={d.key}
          tabIndex={0}
          onMouseEnter={() => setHover(d.key)}
          onFocus={() => setHover(d.key)}
          onBlur={() => setHover(null)}
          className="grid grid-cols-[112px_1fr] items-center gap-3 outline-none"
        >
          <span className={`truncate font-mono text-[11px] ${hover === d.key ? 'text-fg' : 'text-muted'}`}>{d.label}</span>
          <div className="flex items-center gap-2">
            <div
              className={`h-[6px] origin-left animate-[grow-x_900ms_var(--ease-soft)_both] rounded-r-[4px] transition-colors ${hover === d.key ? 'bg-accent-2' : 'bg-accent'}`}
              style={{ width: `calc(${(d.value / max) * 100}% - 40px)`, minWidth: 2 }}
            />
            <span className="font-mono text-[11px] tabular-nums text-fg">{fmt(d.value)}</span>
          </div>
        </div>
      ))}
      <SrTable caption={label} rows={data.map((d) => [d.label, d.value])} />
    </figure>
  )
}

// Number first, label under it, as in a "stats & facts" block. As a tile it
// sits in a card with any unit set small beside the number.
export function StatTile({
  label,
  value,
  sub,
  hero,
  tile,
}: {
  label: string
  value: string
  sub?: string
  hero?: boolean
  tile?: boolean
}) {
  const [, num, unit] = value.match(/^([\d.,]+)(\D.*)?$/) ?? [null, value, '']
  const size = hero ? 'text-[clamp(52px,5.4vw,76px)]' : 'text-[clamp(32px,3vw,40px)]'
  const number = (
    <p className={`display text-fg ${size}`} aria-label={value}>
      <span aria-hidden="true">
        <CountUp value={num} />
        {unit && <span className="ml-[0.06em] align-top text-[0.36em] tracking-[-0.02em]">{unit}</span>}
      </span>
    </p>
  )
  if (!tile)
    return (
      <div className="min-w-0">
        {number}
        <p className="mt-2 text-[12.5px] leading-snug text-fg">{label}</p>
        {sub && <p className="mt-0.5 text-[12px] leading-snug text-faint">{sub}</p>}
      </div>
    )
  return (
    <div className="card flex min-w-0 flex-col gap-4 p-5">
      <p className="label">{label}</p>
      {number}
      {sub && (
        <p className="flex items-center gap-2 border-t border-line-2 pt-3 text-[12.5px] leading-snug text-faint">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          {sub}
        </p>
      )}
    </div>
  )
}

// Counts up to a plain number the first time it shows and whenever it changes.
// Anything that is not a plain number is shown as is.
function CountUp({ value }: { value: string }) {
  const target = /^[\d,]+(\.\d+)?$/.test(value) ? Number(value.replace(/,/g, '')) : null
  const decimals = value.split('.')[1]?.length ?? 0
  const [shown, setShown] = useState(target ?? 0)
  const from = useRef(0)

  useEffect(() => {
    if (target == null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target)
      from.current = target
      return
    }
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1100)
      const eased = 1 - (1 - t) ** 4
      setShown(begin + (target - begin) * eased)
      if (t < 1) raf = requestAnimationFrame(step)
      else from.current = target
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])

  if (target == null) return <>{value}</>
  return <>{shown.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>
}

function SrTable({ caption, rows }: { caption: string; rows: [string, number][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
