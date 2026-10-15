import { useState } from 'react'

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
              className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-line-strong' : 'bg-white/[0.06]'}`}
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
                  className={`w-full max-w-[24px] rounded-t-[4px] transition-colors ${
                    hover === i ? 'bg-fg' : 'bg-fg/70'
                  }`}
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-[4px] border border-line-strong bg-[#0d0d0d] px-2.5 py-1.5 shadow-xl">
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
              className={`h-[10px] rounded-r-[4px] transition-colors ${hover === d.key ? 'bg-fg' : 'bg-fg/70'}`}
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

export function StatTile({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-faint">{label}</p>
      <p className={`mt-1 font-normal tracking-[-0.01em] text-fg ${hero ? 'text-[52px] leading-none' : 'text-[28px] leading-tight'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 font-mono text-[10px] text-faint">{sub}</p>}
    </div>
  )
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
