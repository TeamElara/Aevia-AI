// Usage: npm run tune -- ../../eval/dev.jsonl
// Prints an injection threshold sweep, per-category recall and the misses. Dev set only.

import { readFileSync } from 'node:fs';
import { assertDevFile, categoryRecall, parseJsonl, runCase, sweep } from './evaluate';

const path = process.argv[2];
if (!path) {
  console.error('usage: npm run tune -- <path to dev.jsonl>');
  process.exit(2);
}

const cases = parseJsonl(readFileSync(path, 'utf8'));
assertDevFile(path, cases);
const results = cases.map(runCase);

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

console.log('Data categories (found at score >= 0.6)');
console.table(Object.fromEntries(Object.entries(categoryRecall(results)).map(([c, v]) => [c, { ...v, recall: (v.found / v.expected).toFixed(2) }])));

const missedInj = results.filter((r) => r.expectedInjection && r.injection < 0.85);
const falseInj = results.filter((r) => !r.expectedInjection && r.injection >= 0.6);
const missedData = results.filter((r) => r.expectedData.some((c) => !r.foundData.includes(c as never)));
const falseData = results.filter((r) => r.falseData.length);

const list = (title: string, rows: string[]) => console.log(`${title} (${rows.length})${rows.length ? '\n  ' + rows.join('\n  ') : ''}`);
list('Injection missed at 0.85', missedInj.map((r) => `${r.id}  score=${r.injection.toFixed(2)}`));
list('Injection false alarms at 0.6', falseInj.map((r) => `${r.id}  score=${r.injection.toFixed(2)}`));
list('Data categories missed', missedData.map((r) => `${r.id}  expected=${r.expectedData.join(',')} found=${r.foundData.join(',') || '-'}`));
list('Data flagged in allowed cases', falseData.map((r) => `${r.id}  ${r.falseData.join(',')}`));
