/** Project the team's existing frozen evidence; never rescore or read fixture text. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const sha = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(readFileSync('results/mahatva/frozen-provenance.json', 'utf8'));
const commit = execFileSync('git', ['rev-parse', `${manifest.freeze_tag}^{commit}`], { encoding: 'utf8' }).trim();
if (commit !== manifest.freeze_commit) throw new Error('Freeze reference mismatch');
// Hash historical Git blobs in memory, without printing or using fixture contents.
for (const [file, expected] of Object.entries(manifest.files_sha256)) {
  if (sha(execFileSync('git', ['show', `${commit}:${file}`])) !== expected) throw new Error(`Frozen hash mismatch: ${file}`);
}
mkdirSync('results/frozen-console', { recursive: true });
for (const name of ['heldout-leakshield', 'heldout-baseline', 'robustness-leakshield']) {
  const source = `results/${name}.json`, raw = readFileSync(source), report = JSON.parse(raw);
  if (!report.summary || !manifest.files_sha256[report.file]) throw new Error('Unknown report dataset');
  const result = { file: report.file, mode: report.mode, at: report.at, summary: report.summary, retention: report.retention,
    provenance: { frozen: true, freeze_tag: manifest.freeze_tag, freeze_commit: commit, model: manifest.model,
      provider_evidence: 'real Groq; historical team freeze', contract: 'historical original fixture expectations',
      dataset_sha256: manifest.files_sha256[report.file], original_report: source, original_report_sha256: sha(raw),
      baseline_contract: 'Naive query retrieval; attached_doc not forced. Not the current attachment-aware baseline.',
      scope: 'Historical snapshot predates continuation retrieval/API fixes; no claim for current source.',
      timing_scope: manifest.wall_time_note, independence: manifest.independence } };
  writeFileSync(`results/frozen-console/${name}.json`, JSON.stringify(result, null, 2) + '\n');
}
console.log('Prepared three historical frozen console summaries; original reports untouched.');
