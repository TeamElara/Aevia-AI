import type { ReactNode } from 'react'
import { pad2 } from '../lib/format'

// A hairline with a dot at each column edge, as on the top of every sheet.
export function TickRule({ className = '' }: { className?: string }) {
  return (
    <div className={`relative mx-[3px] h-px bg-line-strong ${className}`} aria-hidden="true">
      {[0, 25, 50, 75, 100].map((x) => (
        <span
          key={x}
          className="absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg"
          style={{ left: `${x}%` }}
        />
      ))}
    </div>
  )
}

// The headline sheet each view opens with: one big word, an optional Nº count,
// and a short note (or controls) on the right.
export function Masthead({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <section className="sheet overflow-hidden px-5 pb-6 pt-4 sm:px-8 sm:pb-8">
      <TickRule />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <h1 className="display -ml-[0.05em] text-[clamp(52px,10.5vw,156px)]">
          {title}
          {count != null && (
            <span className="ml-[0.1em] inline-block align-top text-[0.24em] leading-none tracking-[-0.02em]">
              Nº{pad2(count)}
            </span>
          )}
        </h1>
        {children && <div className="max-w-[40ch] text-[13px] leading-snug text-muted">{children}</div>}
      </div>
    </section>
  )
}
