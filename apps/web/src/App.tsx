// Hour-0 shell. The chat view (hours 1–3) and dashboard views replace the
// placeholder panels; the layout and theme tokens stay.

const views = ['Chat', 'Incidents', 'Overview', 'Approvals', 'Eval'] as const

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-semibold">LeakShield</span>
          <span className="font-mono text-xs uppercase tracking-widest whitespace-nowrap text-alert">gateway console</span>
        </div>
        <nav className="flex flex-wrap gap-1">
          {views.map((v) => (
            <button
              key={v}
              className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-panel hover:text-slate-100"
            >
              {v}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 grid place-items-center p-6">
        <div className="rounded-2xl border border-line bg-panel px-8 py-6 text-center">
          <p className="font-mono text-sm text-signal">[AADHAAR_K7Q2]</p>
          <p className="mt-2 text-muted">Chat shell lands in hours 1–3.</p>
        </div>
      </main>
    </div>
  )
}
