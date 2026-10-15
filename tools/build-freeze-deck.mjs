// Editable update of the existing eight-slide template. Requires the bundled Artifact Tool.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { FileBlob, PresentationFile } = await import(process.env.ARTIFACT_TOOL_MODULE ?? '@oai/artifact-tool');
const root = process.cwd(), source = resolve('docs/Alwaz-LeakShield-continued.pptx');
const input = await fs.readFile(source);
const p = await PresentationFile.importPptx(new FileBlob(new Uint8Array(input)));
const info = await p.inspect({ kind: 'textbox,notes', maxChars: 40000 });
const read = async name => JSON.parse(await fs.readFile(`results/freeze-v2-groq/${name}.json`, 'utf8'));
const held = await read('heldout-leakshield'), baseline = await read('heldout-baseline'), robust = await read('robustness-leakshield');
for (const report of [held, baseline, robust]) {
  if (!report.provenance?.frozen || report.provenance.freeze_tag !== 'eval-freeze-v2' || report.summary.errors) throw new Error('Complete, error-free v2 source reports required');
}
const h = held.summary, b = baseline.summary, r = robust.summary;
const set = (id, text) => p.resolve(id).text.replace(info.records.find(v => v.id === id).text, text);
const table = (id, rows) => rows.forEach((row, i) => row.forEach((text, j) => {
  const cell = p.resolve(id).getCell(i, j); cell.text.replace(String(cell.text), String(text));
}));
set('sh/k3yl0zql', 'Arihant · Mahatva · Ojaswi · Alwaz · CyberCUP 6.0');
set('sh/ts7md4r2', 'Real Groq evidence · eval-freeze-v2 · 15 October 2026');
set('sh/t8byxkn2', 'Real Groq and local fallback are separate, explicitly selected providers.');
set('sh/xk7qlczu', 'Outbound\ninspection');
table('tb/it87elgv', [['Scenario', 'Expected boundary'], ['Asha attaches salary bands', 'Deny; zero provider calls'], ['Ravi attaches salary bands', 'Permit HR retrieval'], ['Admin attaches board minutes', 'Deny; no document bypass'], ['CEO attaches board minutes', 'Local only; deny external send'], ['Meera attaches Garuda', 'External: approval; local: allow']]);
set('sh/dgbulwnm', 'Frozen metrics and robustness');
set('sh/cf2tcr61', 'Real Groq gpt-oss-20b · 60 held-out + 60 robustness cases');
table('tb/nad4jits', [['Measurement', 'Observed'], ['Held-out exact actions', `${Math.round(h.correct_action_rate * h.cases)} / ${h.cases}`], ['Provider-leak flags', `Protected ${h.provider_leaks} / baseline ${b.provider_leaks}`], ['Robustness / intervention retention', `${Math.round(r.correct_action_rate * r.cases)} / ${r.cases}; ${robust.retention.retention}`], ['Stage overhead p50 / p95', `Held-out ${h.overhead_ms_p50}/${h.overhead_ms_p95} ms; robust ${r.overhead_ms_p50}/${r.overhead_ms_p95} ms`]]);
set('sh/l4bupwny', `Precision ${h.precision}; recall ${h.recall}. Overhead excludes model time and uninstrumented audit/vault work. These are team-authored cases.`);
set('sh/yhg7epsj', 'Misses and model decision');
set('sh/zi98nu94', 'Frozen rules retain four Hinglish injection misses');
table('tb/4fqlgze9', [['Check', 'Observed', 'Interpretation'], ['Injection rules', '32 / 36 detected', '4 Hinglish misses'], ['Real fp32 classifier', '19 / 110 benign flags', 'Default: none']]);
set('sh/ml07i9sv', 'R-032, R-033, R-034 and R-037 remain missed. Rules were not retuned after this freeze.');
set('sh/7m98ru9g', 'Gateway intervention recall can include ACL or output controls. It is not injection-detector recall. IFSC warning policy remains a known gap.');
set('sh/18byd4zy', 'Limits and rehearsal');
set('sh/ri9g7uhw', 'Real Groq evaluation; versioned frozen source; rules-only classifier.');
set('sh/6h0fypgb', 'Remaining: admin-confirmed ZDR and a joint Arihant/Ojaswi rehearsal. Proposed times are not booked.');
set('sh/tkby9kzm', 'Approved content reaches Groq. Finite tests do not prove zero leakage. Fingerprints catch copying, not arbitrary paraphrases.');
const notes = [
  'Team roles and five-minute narration: docs/REHEARSAL-AND-NARRATION.md. Frozen source eval-freeze-v2 = 05d1afc5cda7309edbc7c733aaca42353128788f, 15 Oct 2026 17:02:11 IST. Do not apply these results to changed decision code.',
  'Authenticated memberships, ACL-before-top-k, relevance gating, assembly checks, outbound scan, provider, output scan, exact scoped restore and link cleaning. Approval replay follows the same pipeline. Source: apps/gateway/src and docs/ALWAZ-CONTINUATION.md.',
  'Explicit attachment expectations: eval/expectations.mjs. Local processing is distinct from external transmission. Admin role grants approval authority, not document read access.',
  'Source: apps/gateway/src/approvals and approval-bridge.ts. Ten-minute encrypted memory queue, hash-bound single replay, metadata-only Mongo and fresh ACL/quarantine checks at completed-result polling. Restart discards ephemeral state.',
  `Sources: results/freeze-v2-groq/heldout-leakshield.json, heldout-baseline.json and robustness-leakshield.json. Model ${held.provenance.model}. Frozen source ${held.provenance.freeze_commit}. Measured-stage overhead excludes inference and uninstrumented audit/vault work. Wall time is separate. Original expected actions and contract explanations are retained. Provider/user leak flags use limited declared assertions, not proof of arbitrary zero leakage. Prior access tests used some authored slices, so not independently blinded.`,
  'Sources: results/freeze-v2-groq/detector-misses.md; results/ojaswi/classifier-check.md. Injection detector 32/36; mutated attacks 20/24 retained. Hinglish misses R-032, R-033, R-034, R-037. H-045 flags secret-shaped security text. H-020 IFSC provider flag follows configured warning policy; preserve it. Real fp32 classifier benign flags 19/110 (~17%); default CLASSIFIER_BACKEND=none. Int8 is refused; historical speed feasibility does not override this decision.',
  'Primary Act: https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf . Sections 6(1), 8(5), 8(6), 8(7). Phased commencement footnote schedules the cited substantive duties eighteen months from 13 November 2025. This is technical mapping, not a legal compliance claim. Notice/consent, notification operations and complete erasure remain outside this demonstration.',
  'Groq source: https://console.groq.com/docs/your-data (checked 15 Oct 2026). Public documentation is not account ZDR confirmation. See docs/GROQ-ACCOUNT-CHECK.md and docs/LIMITATIONS.md. Rehearsals proposed 18:00 and 18:20 IST, not confirmed or recorded. Do not show keys or raw logs.',
];
for (const note of info.records.filter(v => v.kind === 'notes')) p.resolve(note.id).text = notes[note.slideIndex];
await fs.mkdir('tmp/final-deck', { recursive: true });
const candidatePath = resolve('tmp/final-deck/candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(candidatePath);
const skill = process.env.PRESENTATIONS_SKILL_DIR;
if (!skill) throw new Error('Set PRESENTATIONS_SKILL_DIR to the installed presentations skill');
const { finalizePresentation } = await import(pathToFileURL(resolve(skill, 'container_tools/artifact_tool_utils.mjs')).href);
await finalizePresentation({ workspaceDir: root, candidatePath, finalPath: resolve('docs/LeakShield-Freeze-v2.pptx'),
  pythonExecutable: process.env.RUNTIME_PYTHON, explicitTotalSlideCount: 8,
  integrityValidatorPath: resolve(skill, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: resolve(skill, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12191695,6858000', '--validate-bullet-geometry', '--validate-heading-fit',
    ...[3, 5, 6, 7].flatMap(n => ['--require-native-table-slide', String(n)])],
  requiredNativeTableOwnerSlides: [3, 5, 6, 7], verifyArtifactToolImport: true,
  fontPolicy: { basis: 'reference', families: ['Aptos'], referencePath: source, referenceSha256: createHash('sha256').update(input).digest('hex') },
  receiptPath: resolve(`tmp/final-deck/${Date.now()}.validation.json`) });
for (let i = 0; i < p.slides.items.length; i++) {
  const blob = await p.export({ slide: p.slides.items[i], format: 'png', scale: 1 });
  await fs.writeFile(`tmp/final-deck/after-${i + 1}.png`, new Uint8Array(await blob.arrayBuffer()));
}
console.log('Finalized eight editable slides; rendered previews saved.');
