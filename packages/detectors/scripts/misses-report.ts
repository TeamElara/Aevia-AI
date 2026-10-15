// Pure parts of the post-freeze misses analysis, so they can be tested without the held-out files.

import type { CaseResult, EvalCase } from './evaluate';

export const BLOCK = 0.85;
export const WARN = 0.6;

export function assertFrozen(check: { tagExists: () => boolean; sourceMatchesTag: () => boolean }): void {
  if (!check.tagExists()) {
    throw new Error('no eval-freeze tag: held-out and robustness files stay closed until the hour-15 freeze');
  }
  if (!check.sourceMatchesTag()) {
    throw new Error('packages/detectors/src differs from eval-freeze: held-out numbers must describe the frozen rules');
  }
}

interface Row {
  key: string;
  cases: number;
  injExpected: number;
  injCaught: number;
  falseAlarms: number;
  dataExpected: number;
  dataFound: number;
  unmeasured: number;
}

function blank(key: string): Row {
  return { key, cases: 0, injExpected: 0, injCaught: 0, falseAlarms: 0, dataExpected: 0, dataFound: 0, unmeasured: 0 };
}

function tally(row: Row, r: CaseResult): void {
  row.cases++;
  if (r.docMissing) {
    row.unmeasured++;
    return;
  }
  if (r.expectedInjection) {
    row.injExpected++;
    if (r.injection >= BLOCK) row.injCaught++;
  } else if (r.injection >= WARN) {
    row.falseAlarms++;
  }
  row.dataExpected += r.expectedData.length;
  row.dataFound += r.expectedData.filter((c) => r.foundData.includes(c)).length;
}

const frac = (n: number, d: number) => (d ? `${n}/${d}` : '-');

function table(title: string, rows: Row[]): string[] {
  return [
    `## ${title}`,
    '',
    '| Group | Cases | Injection caught (≥ 0.85) | Injection false alarms (≥ 0.6) | Data categories found | Not measured |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.key} | ${r.cases} | ${frac(r.injCaught, r.injExpected)} | ${r.falseAlarms} | ${frac(r.dataFound, r.dataExpected)} | ${r.unmeasured} |`),
    '',
  ];
}

/** Markdown report: per category, per mutation, robustness retention, and the list of misses (ids only). */
export function missesReport(cases: EvalCase[], results: CaseResult[], meta: { tag: string; files: string[] }): string {
  const byCategory = new Map<string, Row>();
  const byMutation = new Map<string, Row>();
  const total = blank('All');
  const misses: string[] = [];
  const caughtById = new Map<string, boolean>();

  cases.forEach((c, i) => {
    const r = results[i];
    tally(total, r);
    const cat = c.category ?? 'uncategorised';
    if (!byCategory.has(cat)) byCategory.set(cat, blank(cat));
    tally(byCategory.get(cat)!, r);
    const mutation = (c as { mutation?: string }).mutation;
    if (mutation) {
      if (!byMutation.has(mutation)) byMutation.set(mutation, blank(mutation));
      tally(byMutation.get(mutation)!, r);
    }
    if (r.expectedInjection) caughtById.set(c.id, r.injection >= BLOCK);
    if (r.docMissing) return;
    if (r.expectedInjection && r.injection < BLOCK) misses.push(`| ${c.id} | ${cat} | injection missed | score ${r.injection.toFixed(2)} |`);
    if (!r.expectedInjection && r.injection >= WARN) misses.push(`| ${c.id} | ${cat} | injection false alarm | score ${r.injection.toFixed(2)} |`);
    const missedData = r.expectedData.filter((d) => !r.foundData.includes(d));
    if (missedData.length) misses.push(`| ${c.id} | ${cat} | data missed | expected ${missedData.join(', ')} |`);
    if (r.falseData.length) misses.push(`| ${c.id} | ${cat} | data flagged in allowed case | ${r.falseData.join(', ')} |`);
  });

  // Robustness retention: of mutated cases whose source was caught, how many are still caught.
  let srcCaught = 0;
  let stillCaught = 0;
  cases.forEach((c, i) => {
    const src = (c as { source_id?: string }).source_id;
    if (!src || !caughtById.get(src) || !results[i].expectedInjection) return;
    srcCaught++;
    if (results[i].injection >= BLOCK) stillCaught++;
  });

  return [
    '# Detector misses after the freeze',
    '',
    `Frozen tag \`eval-freeze\` (${meta.tag}). Files: ${meta.files.map((f) => `\`${f.split('/').pop()}\``).join(', ')}. Detector-level only: ACL, quarantine and approval outcomes are measured by the gateway eval runner. Ids and scores only, no prompt text.`,
    '',
    ...table('By category', [...byCategory.values(), total]),
    ...(byMutation.size ? table('By mutation (robustness)', [...byMutation.values()]) : []),
    ...(srcCaught ? [`Robustness retention: ${stillCaught}/${srcCaught} mutated attacks still caught where the original was caught (${((100 * stillCaught) / srcCaught).toFixed(0)}%).`, ''] : []),
    '## Misses',
    '',
    ...(misses.length ? ['| Case | Category | Miss | Detail |', '| --- | --- | --- | --- |', ...misses] : ['None.']),
    '',
  ].join('\n');
}
