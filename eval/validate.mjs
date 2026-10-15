#!/usr/bin/env node
// Checks eval JSONL files against the case format in eval/README.md.
// Usage: node eval/validate.mjs eval/dev.jsonl [more files...]

import { readFileSync } from 'node:fs'

const SPLITS = ['dev', 'heldout', 'robustness']
const CATEGORIES = [
  'normal_work', 'security_discussion', 'benign_lookalike', 'authorised_rag',
  'sensitive_disclosure', 'direct_injection', 'indirect_injection', 'unauthorised_retrieval',
]
const AUTHORS = ['mahatva', 'alwaz', 'arihant', 'script', 'ojaswi']
const USERS = ['asha', 'ravi', 'meera', 'ceo', 'admin']
const ACTIONS = [
  'allow', 'warn', 'mask', 'redact', 'quarantine', 'deny', 'require_approval', 'block', 'block_response',
]
const MUTATIONS = ['hinglish', 'homoglyph', 'base64', 'paraphrase', 'leet', 'fullwidth', 'zero_width', 'rot13', 'emoji']
const ID_PREFIX = { dev: 'D-', heldout: 'H-', robustness: 'R-' }

// Aadhaar check: a 12-digit number starting 2-9 that passes Verhoeff must be
// deliberate, so synthetic numbers in cases are at least well-formed.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]]
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]]
const verhoeff = (s) => [...s].reverse().reduce((c, ch, i) => D[c][P[i % 8][+ch]], 0) === 0

function check(c, seenIds) {
  const errs = []
  const need = (k) => { if (c[k] === undefined) errs.push(`missing "${k}"`) }
  const oneOf = (k, list) => { if (c[k] !== undefined && !list.includes(c[k])) errs.push(`"${k}" must be one of ${list.join(', ')}`) }

  for (const k of ['id', 'split', 'category', 'author', 'user', 'prompt', 'expected_action', 'expected_categories']) need(k)
  oneOf('split', SPLITS)
  oneOf('category', CATEGORIES)
  oneOf('author', AUTHORS)
  oneOf('user', USERS)
  oneOf('expected_action', ACTIONS)

  // Detection (Ojaswi) tunes on dev and may write dev cases, never held-out or robustness ones.
  if (c.author === 'ojaswi' && c.split !== undefined && c.split !== 'dev') errs.push('author "ojaswi" may only write dev cases')
  if (c.response !== undefined && typeof c.response !== 'string') errs.push('"response" must be a string')
  if (c.id && c.split && !String(c.id).startsWith(ID_PREFIX[c.split])) errs.push(`id for split "${c.split}" must start with ${ID_PREFIX[c.split]}`)
  if (c.id && seenIds.has(c.id)) errs.push(`duplicate id ${c.id}`)
  if (typeof c.prompt === 'string' && !c.prompt.trim()) errs.push('empty prompt')
  if (c.expected_categories !== undefined && !Array.isArray(c.expected_categories)) errs.push('"expected_categories" must be an array')
  if (c.history !== undefined && !(Array.isArray(c.history) && c.history.every((t) => typeof t === 'string'))) errs.push('"history" must be an array of strings')

  if (c.split === 'robustness') {
    need('source_id')
    need('mutation')
    oneOf('mutation', MUTATIONS)
  }

  const text = [...(c.history || []), c.prompt || ''].join('\n')
  for (const m of text.matchAll(/\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g)) {
    const digits = m[0].replace(/\D/g, '')
    if ((c.expected_categories || []).includes('AADHAAR') && !verhoeff(digits)) {
      errs.push(`Aadhaar-like ${m[0]} fails Verhoeff but the case expects AADHAAR`)
    }
  }
  return errs
}

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node eval/validate.mjs <file.jsonl> [...]')
  process.exit(2)
}

let bad = 0
for (const file of files) {
  const seen = new Set()
  const lines = readFileSync(file, 'utf8').split('\n')
  let count = 0
  lines.forEach((line, i) => {
    if (!line.trim()) return
    count++
    let c
    try {
      c = JSON.parse(line)
    } catch (e) {
      console.error(`${file}:${i + 1}: invalid JSON (${e.message})`)
      bad++
      return
    }
    for (const err of check(c, seen)) {
      console.error(`${file}:${i + 1} ${c.id ?? ''}: ${err}`)
      bad++
    }
    if (c.id) seen.add(c.id)
  })
  console.log(`${file}: ${count} case(s)`)
}
if (bad) {
  console.error(`${bad} problem(s) found`)
  process.exit(1)
}
console.log('OK')
