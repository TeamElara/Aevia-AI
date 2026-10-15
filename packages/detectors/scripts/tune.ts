// Usage: npm run tune -- ../../eval/dev.jsonl [--corpus ../../seed/corpus.js]
// Prints an injection threshold sweep, per-category recall and the misses. Dev set only.
// --corpus: a module exporting documents [{ id, text }], so attached_doc cases are scanned too.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertDevFile, categoryRecall, parseJsonl, runCase, sweep } from './evaluate';

const args = process.argv.slice(2);
const corpusAt = args.indexOf('--corpus');
const corpusPath = corpusAt >= 0 ? args[corpusAt + 1] : undefined;
const corpusValueAt = corpusAt >= 0 ? corpusAt + 1 : -1;
const path = args.find((a, i) => !a.startsWith('--') && i !== corpusValueAt);
if (!path || (corpusAt >= 0 && !corpusPath)) {
  console.error('usage: npm run tune -- <path to dev.jsonl> [--corpus <corpus module>]');
  process.exit(2);
}

const docs: Record<string, string> = {};
if (corpusPath) {
  const mod = await import(pathToFileURL(resolve(corpusPath)).href);
  for (const d of mod.documents ?? []) docs[d.id] = d.text;
}

const cases = parseJsonl(readFileSync(path, 'utf8'));
assertDevFile(path, cases);
const results = cases.map((c) => runCase(c, docs));

console.log(`\n${cases.length} dev cases from ${path}\n`);
console.log('Injection threshold sweep');
console.table(
  sweep(results).map((r) => ({
    threshold: r.threshold,
    precision: r.precision.toFixed(2),
    recall: r.recall.toFixed(2),
    'false alarms': r.fp,
    missed: r.fn,
  })),
);

console.log('Data categories (any finding)');
console.table(Object.fromEntries(Object.entries(categoryRecall(results)).map(([c, v]) => [c, { ...v, recall: (v.found / v.expected).toFixed(2) }])));

// Cases whose attached document wasn't supplied can't be judged; they're listed separately below.
const measured = results.filter((r) => !r.docMissing);
const missedInj = measured.filter((r) => r.expectedInjection && r.injection < 0.85);
const falseInj = measured.filter((r) => !r.expectedInjection && r.injection >= 0.6);
const missedData = measured.filter((r) => r.expectedData.some((c) => !r.foundData.includes(c as never)));
const falseData = measured.filter((r) => r.falseData.length);

const missingDocs = results.filter((r) => r.docMissing);

const list = (title: string, rows: string[]) => console.log(`${title} (${rows.length})${rows.length ? '\n  ' + rows.join('\n  ') : ''}`);
list('Injection missed at 0.85', missedInj.map((r) => `${r.id}  score=${r.injection.toFixed(2)}`));
list('Injection false alarms at 0.6', falseInj.map((r) => `${r.id}  score=${r.injection.toFixed(2)}`));
list('Data categories missed', missedData.map((r) => `${r.id}  expected=${r.expectedData.join(',')} found=${r.foundData.join(',') || '-'}`));
list('Data flagged in allowed cases', falseData.map((r) => `${r.id}  ${r.falseData.join(',')}`));
list('Not measured: attached doc text not supplied (use --corpus)', missingDocs.map((r) => r.id));
