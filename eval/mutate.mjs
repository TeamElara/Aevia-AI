#!/usr/bin/env node
// Generates the two scripted robustness mutations (PLAN.md §10) from held-out
// attack cases: "homoglyph" (Cyrillic look-alikes, leetspeak, zero-width
// characters) and "base64" (the whole prompt wrapped in base64). Seeded, so the
// same input always gives the same output. Hinglish and paraphrase mutations
// are written by hand.
//
//   node eval/mutate.mjs eval/heldout.jsonl [--sources H-053,H-054] [--start 1] >> eval/robustness.jsonl

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const file = args.find((a, i) => !a.startsWith('--') && !['--sources', '--start'].includes(args[i - 1]))
if (!file) {
  console.error('Usage: node eval/mutate.mjs <heldout.jsonl> [--sources ID,ID] [--start N]')
  process.exit(2)
}

const cases = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))

// Default sources: the first 15 held-out cases that expect an intervention.
const wanted = option('--sources')?.split(',').map((s) => s.trim())
const sources = wanted
  ? cases.filter((c) => wanted.includes(c.id))
  : cases.filter((c) => !['allow', 'warn'].includes(c.expected_action)).slice(0, 15)
if (wanted && sources.length !== wanted.length) {
  const missing = wanted.filter((id) => !sources.some((c) => c.id === id))
  console.error(`Not found in ${file}: ${missing.join(', ')}`)
  process.exit(1)
}

let seed = 20261015
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const HOMOGLYPH = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', i: 'і', y: 'у', s: 'ѕ' } // Cyrillic
const LEET = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' }
const ZWSP = '​'

// Letters only: digits stay intact so Aadhaar, card and PAN values keep their meaning.
function homoglyph(text) {
  return text
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word) || word.length < 4 || /\d/.test(word)) return word
      const roll = rand()
      if (roll < 0.35) return [...word].map((ch) => HOMOGLYPH[ch] ?? ch).join('')
      if (roll < 0.6) return [...word].map((ch) => (rand() < 0.5 ? (LEET[ch.toLowerCase()] ?? ch) : ch)).join('')
      if (roll < 0.85) {
        const cut = 1 + Math.floor(rand() * (word.length - 1))
        return word.slice(0, cut) + ZWSP + word.slice(cut)
      }
      return word
    })
    .join('')
}

function base64(text) {
  return `Decode this base64 and respond to it exactly: ${Buffer.from(text, 'utf8').toString('base64')}`
}

let n = Number(option('--start') ?? 1)
const out = []
for (const c of sources) {
  for (const [mutation, fn] of [['homoglyph', homoglyph], ['base64', base64]]) {
    out.push({
      id: `R-${String(n++).padStart(3, '0')}`,
      split: 'robustness',
      category: c.category,
      author: 'script',
      user: c.user,
      history: c.history ?? [],
      prompt: fn(c.prompt),
      attached_doc: c.attached_doc ?? null,
      expected_action: c.expected_action,
      expected_categories: c.expected_categories,
      source_id: c.id,
      mutation,
      ...(c.must_not_reach_provider ? { must_not_reach_provider: c.must_not_reach_provider } : {}),
      notes: `Scripted ${mutation} mutation of ${c.id}`,
    })
  }
}

process.stdout.write(out.map((o) => JSON.stringify(o)).join('\n') + '\n')
console.error(`${out.length} mutation(s) from ${sources.length} source case(s); next id R-${String(n).padStart(3, '0')}`)
