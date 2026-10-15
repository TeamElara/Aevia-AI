// AFTER the hour-15 freeze only.
// Usage: npm run misses -- ../../eval/heldout.jsonl ../../eval/robustness.jsonl --corpus ../../seed/corpus.js [--out ../../results/ojaswi/misses.md]
//
// Refuses to run unless the `eval-freeze` tag exists and the detector source at HEAD is identical to it,
// so held-out numbers always describe the frozen rules. Reports ids, categories and scores only, never prompt text.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseJsonl, runCase } from './evaluate';
import { assertFrozen, missesReport } from './misses-report';

const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : undefined;
};
const flagValues = new Set(['--corpus', '--out'].map(valueOf).filter(Boolean));
const files = args.filter((a) => !a.startsWith('--') && !flagValues.has(a));
if (!files.length) {
  console.error('usage: npm run misses -- <heldout.jsonl> [robustness.jsonl] --corpus <corpus module> [--out <md>]');
  process.exit(2);
}

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).trim();
// fileURLToPath, not URL.pathname: the repo path may contain spaces, and a wrong path makes `git diff --quiet` pass.
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const TAG = process.env.LEAKSHIELD_FREEZE_TAG || 'eval-freeze';
assertFrozen({
  tagExists: () => {
    try {
      git('rev-parse', '--verify', '--quiet', `refs/tags/${TAG}`);
      return true;
    } catch {
      return false;
    }
  },
  sourceMatchesTag: () => {
    try {
      git('diff', '--quiet', TAG, '--', SRC);
      return true;
    } catch {
      return false;
    }
  },
});

const docs: Record<string, string> = {};
const corpus = valueOf('--corpus');
if (corpus) {
  const mod = await import(pathToFileURL(resolve(corpus)).href);
  for (const d of mod.documents ?? []) docs[d.id] = d.text;
}

const cases = files.flatMap((f) => parseJsonl(readFileSync(f, 'utf8')));
const results = cases.map((c) => runCase(c, docs));
const report = missesReport(cases, results, { tag: git('rev-parse', '--short', `${TAG}^{commit}`), tagName: TAG, files });

const out = valueOf('--out');
if (out) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), report);
  console.log(`wrote ${resolve(out)}`);
}
console.log(report);
