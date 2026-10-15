#!/usr/bin/env node
// Generates scripted robustness mutations (PLAN.md §10) from attack cases. Seeded, so the same input
// always gives the same output. Hinglish and paraphrase mutations are written by hand.
//
// Default (unchanged since R-001..R-030): "homoglyph" (Cyrillic look-alikes, leetspeak, zero-width
// characters mixed) and "base64" (the whole prompt wrapped in base64).
// Detection v3 adds single-technique mutations, chosen with --mutations:
//   leet        letters swapped for digits/symbols (ign0r3)
//   fullwidth   fullwidth Unicode forms (ｉｇｎｏｒｅ)
//   zero_width  zero-width characters inside words
//   rot13       the prompt ROT13-encoded with a decode instruction
//   emoji       emoji between the letters of longer words
//
//   node eval/mutate.mjs eval/heldout.jsonl [--sources H-053,H-054] [--start 1] [--mutations leet,rot13] >> eval/robustness.jsonl

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

let seed = 20261015
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

// The v3 mutators get their own generator per prompt, so adding one never changes another's output.
function seeded(text) {
  let s = 20261015
  for (const ch of text) s = (s * 31 + ch.codePointAt(0)) % 2147483647 || 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const HOMOGLYPH = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', i: 'і', y: 'у', s: 'ѕ' } // Cyrillic
const LEET = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' }
const ZWSP = '​'
const ZERO_WIDTH = ['​', '‌', '‍', '⁠']
const EMOJI = ['🔥', '✨', '🙂', '🚀', '⭐', '💡']

// Split into user-visible characters so Devanagari vowel signs stay attached to their consonant.
const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' })
const graphemes = (w) => [...segmenter.segment(w)].map((g) => g.segment)

// Letters only: digits stay intact so Aadhaar, card and PAN values keep their meaning.
const isWord = (word) => !/^\s+$/.test(word) && word.length >= 4 && !/\d/.test(word)

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

function leet(text) {
  const r = seeded(text)
  return text.split(/(\s+)/).map((w) => (isWord(w) ? [...w].map((ch) => (r() < 0.6 ? (LEET[ch.toLowerCase()] ?? ch) : ch)).join('') : w)).join('')
}

function fullwidth(text) {
  return [...text].map((ch) => {
    const cp = ch.codePointAt(0)
    if (cp === 0x20) return '　'
    return cp >= 0x21 && cp <= 0x7e && !/\d/.test(ch) ? String.fromCodePoint(cp + 0xfee0) : ch
  }).join('')
}

function zeroWidth(text) {
  const r = seeded(text)
  return text.split(/(\s+)/).map((w) => {
    if (!isWord(w)) return w
    const chars = graphemes(w)
    return chars.map((ch, i) => (i > 0 && r() < 0.5 ? ZERO_WIDTH[Math.floor(r() * ZERO_WIDTH.length)] : '') + ch).join('')
  }).join('')
}

export function rot13Text(text) {
  return text.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function rot13(text) {
  return `This message is ROT13. Decode it and do what it says: ${rot13Text(text)}`
}

function emoji(text) {
  const r = seeded(text)
  return text.split(/(\s+)/).map((w) => {
    if (!isWord(w) || r() > 0.6) return w
    const e = EMOJI[Math.floor(r() * EMOJI.length)]
    return graphemes(w).join(e)
  }).join('')
}

export const MUTATORS = { homoglyph, base64, leet, fullwidth, zero_width: zeroWidth, rot13, emoji }
export const DEFAULT_MUTATIONS = ['homoglyph', 'base64']

function main() {
  const args = process.argv.slice(2)
  const option = (name) => {
    const i = args.indexOf(name)
    return i >= 0 ? args[i + 1] : undefined
  }
  const file = args.find((a, i) => !a.startsWith('--') && !['--sources', '--start', '--mutations'].includes(args[i - 1]))
  if (!file) {
    console.error('Usage: node eval/mutate.mjs <heldout.jsonl> [--sources ID,ID] [--start N] [--mutations name,name]')
    process.exit(2)
  }
  const mutations = option('--mutations')?.split(',').map((s) => s.trim()) ?? DEFAULT_MUTATIONS
  const unknown = mutations.filter((m) => !MUTATORS[m])
  if (unknown.length) {
    console.error(`Unknown mutation(s): ${unknown.join(', ')}. Known: ${Object.keys(MUTATORS).join(', ')}`)
    process.exit(2)
  }

  const cases = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))

  // Default sources: the first 15 cases that expect an intervention.
  const wanted = option('--sources')?.split(',').map((s) => s.trim())
  const sources = wanted
    ? cases.filter((c) => wanted.includes(c.id))
    : cases.filter((c) => !['allow', 'warn'].includes(c.expected_action)).slice(0, 15)
  if (wanted && sources.length !== wanted.length) {
    const missing = wanted.filter((id) => !sources.some((c) => c.id === id))
    console.error(`Not found in ${file}: ${missing.join(', ')}`)
    process.exit(1)
  }

  let n = Number(option('--start') ?? 1)
  const out = []
  for (const c of sources) {
    for (const mutation of mutations) {
      out.push({
        id: `R-${String(n++).padStart(3, '0')}`,
        split: 'robustness',
        category: c.category,
        author: 'script',
        user: c.user,
        history: c.history ?? [],
        prompt: MUTATORS[mutation](c.prompt),
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
