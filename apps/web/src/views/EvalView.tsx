import { useState } from 'react'
import { chat, login, type Backend } from '../api/client'
import { actionLabel, isStop, type Action } from '../api/contract'
import { Masthead } from '../components/Masthead'
import { StatTile } from '../components/charts'
import { ActionBadge } from '../components/PayloadCard'
// Same scoring rules as eval/run.mjs, so live and frozen numbers agree.
import { judge } from '../../../../eval/checks.mjs'

type Case = {
  id: string
  category: string
  user: string
  history?: string[]
  prompt: string
  expected_action: Action
  expected_categories: string[]
  must_not_reach_provider?: string[]
  must_not_reach_user?: string[]
}

type Row = {
  status: 'idle' | 'running' | 'done' | 'error'
  observed_action?: Action
  correct?: boolean
  expected_intervention?: boolean
  observed_intervention?: boolean
  provider_calls?: number
  provider_leak?: boolean | null
  user_leak?: boolean
  overhead_ms?: number
  error?: string
}

type Summary = {
  precision: number | null
  recall: number | null
  false_positives_on_allowed: string
  correct_action_rate: number | null
  provider_leaks: number | string
  user_leaks: number
  overhead_ms_p50: number | null
  overhead_ms_p95: number | null
  cases: number
}
type Report = { file: string; mode: string; at: string; summary: Summary }

const parseJsonl = (raw: string): Case[] =>
  raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))

const caseFiles = import.meta.glob('../../../../eval/{live_subset,heldout}.jsonl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const reportFiles = import.meta.glob('../../../../results/*.json', { import: 'default', eager: true }) as Record<string, Report>

function pickLiveSubset(): { cases: Case[]; source: string } {
  const subset = Object.entries(caseFiles).find(([p]) => p.endsWith('live_subset.jsonl'))
  if (subset) return { cases: parseJsonl(subset[1]), source: 'eval/live_subset.jsonl' }
  const held = Object.entries(caseFiles).find(([p]) => p.endsWith('heldout.jsonl'))
  if (!held) return { cases: [], source: 'none' }
  // Until the subset is picked: up to 10 held-out cases, spread across categories.
  const byCat = new Map<string, Case[]>()
  for (const c of parseJsonl(held[1])) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c])
  const out: Case[] = []
  while (out.length < 10 && [...byCat.values()].some((l) => l.length)) {
    for (const list of byCat.values()) if (list.length && out.length < 10) out.push(list.shift()!)
  }
  return { cases: out, source: 'first held-out cases (eval/live_subset.jsonl not picked yet)' }
}

const { cases, source } = pickLiveSubset()
const frozen = Object.values(reportFiles).filter((r) => r.file?.includes('heldout') && r.mode !== 'mock')
const leakshieldReport = frozen.find((r) => r.mode === 'leakshield')
const baselineReport = frozen.find((r) => r.mode === 'baseline')

const ratio = (a: number, b: number) => (b ? (a / b).toFixed(2) : '–')

export function EvalView() {
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [running, setRunning] = useState(false)
  const [backend, setBackend] = useState<Backend | null>(null)

  async function run() {
    setRunning(true)
    setRows(Object.fromEntries(cases.map((c) => [c.id, { status: 'idle' } as Row])))
    const tokens = new Map<string, { token: string; backend: Backend }>()
    for (const c of cases) {
      setRows((r) => ({ ...r, [c.id]: { status: 'running' } }))
      try {
        if (!tokens.has(c.user)) tokens.set(c.user, await login(c.user))
        const s = tokens.get(c.user)!
        setBackend(s.backend)
        let conversation_id: string | null = null
        for (const turn of c.history ?? []) {
          conversation_id = (await chat(s.backend, s.token, { conversation_id, message: turn })).conversation_id
        }
        const res = await chat(s.backend, s.token, { conversation_id, message: c.prompt }, { evalCapture: true })
        setRows((r) => ({ ...r, [c.id]: { status: 'done', ...judge(c, res) } }))
      } catch (e) {
        setRows((r) => ({ ...r, [c.id]: { status: 'error', error: (e as Error).message } }))
      }
    }
    setRunning(false)
  }

  const done = cases.map((c) => rows[c.id]).filter((r) => r?.status === 'done')
  const caught = done.filter((r) => r.expected_intervention && r.observed_intervention).length
  const shouldCatch = done.filter((r) => r.expected_intervention).length
  const falsePos = done.filter((r) => !r.expected_intervention && r.observed_intervention).length
  const leaks = done.filter((r) => r.provider_leak || r.user_leak).length
  const overheads = done.map((r) => r.overhead_ms ?? 0).sort((a, b) => a - b)
  const p50 = overheads.length ? overheads[Math.ceil(overheads.length / 2) - 1] : null

  return (
    <div className="flex flex-col gap-3">
      <Masthead title="Eval" count={cases.length}>
        Labelled attacks and normal requests, scored with the same rules as eval/run.mjs. A block counts only if the model
        was called 0 times.
      </Masthead>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
        <section className="sheet min-w-0">
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-4 sm:px-8">
              <h2 className="text-[15px] font-medium tracking-[-0.01em] text-fg">Live red-team run</h2>
              <span className="text-[12px] text-faint">
                {cases.length} cases{backend === 'mock' ? ' · mock gateway, numbers are not real' : ''}
              </span>
              <button
                onClick={run}
                disabled={running || !cases.length}
                className="ml-auto rounded-full bg-fg px-4 py-1.5 text-[13px] text-void transition hover:bg-fg/80 disabled:opacity-40"
              >
                {running ? 'Running…' : done.length ? 'Run again' : 'Run live subset'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 border-b border-line px-5 py-6 sm:grid-cols-4 sm:px-8">
              <StatTile label="Correct action" value={`${done.filter((r) => r.correct).length}/${cases.length}`} />
              <StatTile label="Attacks caught" value={shouldCatch ? `${caught}/${shouldCatch}` : '–'} />
              <StatTile label="False positives" value={done.length ? String(falsePos) : '–'} />
              <StatTile label="Leaks" value={done.length ? String(leaks) : '–'} sub={p50 != null ? `overhead p50 ${p50}ms` : undefined} />
            </div>

            <p className="px-5 pt-4 text-[12px] text-faint sm:px-8">Source: {source}. One request at a time.</p>

            <div className="overflow-x-auto px-5 pb-6 pt-2 sm:px-8">
              <table className="w-full min-w-[620px] border-collapse text-left">
                <thead>
                  <tr className="text-[11px] text-faint">
                    {['Case', 'Category', 'Expected', 'Observed', 'Calls', 'Result'].map((h) => (
                      <th key={h} className="border-b border-line py-2.5 pr-4 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {cases.map((c) => {
                    const r = rows[c.id]
                    return (
                      <tr key={c.id} className="border-b border-line" title={c.prompt}>
                        <td className="py-2.5 pr-4 font-mono text-[11px] text-fg">{c.id}</td>
                        <td className="py-2.5 pr-4 text-muted">{c.category.replace(/_/g, ' ')}</td>
                        <td className="py-2.5 pr-4 font-mono text-[11px] text-muted">{c.expected_action}</td>
                        <td className="py-2.5 pr-4">
                          {r?.observed_action ? (
                            <ActionBadge label={actionLabel[r.observed_action]} stop={isStop(r.observed_action)} />
                          ) : (
                            <span className="font-mono text-[11px] text-faint">{r?.status === 'running' ? 'running…' : '—'}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-[11px] text-muted">{r?.provider_calls ?? '—'}</td>
                        <td className="py-2.5 font-mono text-[11px]">
                          {r?.status === 'error' && <span className="text-muted">error</span>}
                          {r?.status === 'done' &&
                            (r.provider_leak || r.user_leak ? (
                              <span className="rounded-full bg-fg px-2 py-0.5 text-void">LEAK</span>
                            ) : r.correct ? (
                              <span className="text-fg">✓ correct</span>
                            ) : (
                              <span className="text-muted">✗ miss</span>
                            ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="ink min-w-0">
          <div className="space-y-8 px-5 py-6 sm:p-8">
            <div>
              <h2 className="text-[15px] text-fg">Frozen report</h2>
              <p className="mt-1 text-[12px] text-faint">60 held-out cases at tag eval-freeze, with and without LeakShield</p>
            </div>

            {leakshieldReport ? (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <StatTile
                    hero
                    label="Provider leaks with LeakShield"
                    value={String(leakshieldReport.summary.provider_leaks)}
                  />
                  <StatTile
                    label="Without LeakShield"
                    value={baselineReport ? String(baselineReport.summary.provider_leaks) : '–'}
                    sub={baselineReport ? 'same cases, same model' : 'baseline not run yet'}
                  />
                </div>
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="text-[11px] text-faint">
                      <th className="border-b border-line py-2 font-normal">Metric</th>
                      <th className="border-b border-line py-2 text-right font-normal">LeakShield</th>
                      <th className="border-b border-line py-2 text-right font-normal">Baseline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ['Precision', 'precision'],
                        ['Recall', 'recall'],
                        ['False positives', 'false_positives_on_allowed'],
                        ['Correct action', 'correct_action_rate'],
                        ['User leaks', 'user_leaks'],
                        ['Overhead p50 (ms)', 'overhead_ms_p50'],
                        ['Overhead p95 (ms)', 'overhead_ms_p95'],
                      ] as [string, keyof Summary][]
                    ).map(([label, key]) => (
                      <tr key={key} className="border-b border-line">
                        <td className="py-2 text-muted">{label}</td>
                        <td className="py-2 text-right font-mono text-[12px] text-fg">{String(leakshieldReport.summary[key] ?? '–')}</td>
                        <td className="py-2 text-right font-mono text-[12px] text-muted">
                          {baselineReport ? String(baselineReport.summary[key] ?? '–') : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="font-mono text-[10px] text-faint">Run at {new Date(leakshieldReport.at).toLocaleString('en-GB')}</p>
              </>
            ) : (
              <div className="space-y-3 border border-dashed border-line-strong p-5 text-[13px] text-muted">
                <p>No frozen report yet. After the hour-15 freeze, run:</p>
                <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-fg">
                  node eval/run.mjs eval/heldout.jsonl{'\n'}node eval/run.mjs eval/heldout.jsonl --baseline
                </pre>
                <p className="text-[12px] text-faint">Reports written to results/ appear here automatically.</p>
              </div>
            )}

            <div className="border-t border-line pt-5">
              <p className="text-[12px] text-faint">
                Live run: {done.length ? `${ratio(caught, shouldCatch)} recall on ${done.length} cases` : 'not run in this session'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
