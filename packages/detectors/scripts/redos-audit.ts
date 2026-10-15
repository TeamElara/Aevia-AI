// ReDoS audit: every regex in src/ against 50 KB adversarial inputs. Flags any single run over 50 ms.
// Usage (repo root): npx tsx packages/detectors/scripts/redos-audit.ts [--out results/ojaswi/redos-audit.md]
//
// Coverage: regex literals are read from the TypeScript AST; regexes built with `new RegExp(...)` at module load
// are captured by wrapping the RegExp constructor before the detectors are imported. Each regex runs in its own
// worker with a hard timeout, so a catastrophic pattern is reported instead of hanging the audit.
// Read-only: nothing in src/ is changed.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../src');
const SIZE = 50_000;
const LIMIT_MS = 50;
const WORKER_TIMEOUT_MS = 15_000;

interface Rx { id: string; source: string; flags: string; where: string; kind: 'literal' | 'constructed' }

// 1. Regex literals from the AST.
const regexes: Rx[] = [];
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.ts'))) {
  const text = readFileSync(join(SRC, file), 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const lit = node.getText(sf);
      const end = lit.lastIndexOf('/');
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      regexes.push({ id: '', source: lit.slice(1, end), flags: lit.slice(end + 1), where: `src/${file}:${line + 1}`, kind: 'literal' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// 2. Regexes constructed at module load (multi-part patterns joined from String.raw arrays, word lists).
const NativeRegExp = RegExp;
const constructed: Rx[] = [];
(globalThis as { RegExp: RegExpConstructor }).RegExp = new Proxy(NativeRegExp, {
  construct(target, args: [string | RegExp, string?]) {
    const re = new target(...args);
    const caller = (new Error().stack ?? '').split('\n').find((l) => l.includes('/src/') && !l.includes('redos-audit'));
    const m = caller?.match(/src\/([\w.-]+\.ts):(\d+)/);
    if (m) constructed.push({ id: '', source: re.source, flags: re.flags, where: `src/${m[1]}:${m[2]}`, kind: 'constructed' });
    return re;
  },
}) as RegExpConstructor;
await import('../src/index');
(globalThis as { RegExp: RegExpConstructor }).RegExp = NativeRegExp;
const seen = new Set(regexes.map((r) => r.source + '/' + r.flags));
for (const r of constructed) if (!seen.has(r.source + '/' + r.flags)) { seen.add(r.source + '/' + r.flags); regexes.push(r); }
regexes.forEach((r, i) => (r.id = `R${String(i + 1).padStart(3, '0')}`));

// 3. Adversarial inputs: repeated units that partially match common classes, each ending in a mismatch.
const pump = (unit: string, tail = '!') => unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE - tail.length) + tail;
const UNITS: Record<string, string> = {
  letters: 'a', upper: 'A', digits: '1', digit_space: '9 ', digit_dash: '9-', digit_dot: '9.', at: '@', dot: '.', space: ' ', newline: '\n',
  tab: '\t', dquote: '"', squote: "'", percent: '%', pct_hex: '%41', lbracket: '[', lparen: '(', lbrace: '{', lt: '<', hash: '#',
  underscore: '_', slash: '/', equals: '=', alnum: 'a1', letter_dot: 'a.', letter_at: 'a@', letter_space: 'a ', word_dash: 'ab-',
  cyrillic: 'Іgnоrе ', devanagari: 'निर्देश ', zero_width: 'a​', b64ish: 'QUJD', hexish: 'ab', email_ish: 'x@y.',
  md_link: '![a](', ignore_words: 'ignore ', show_target: 'show your system prompt ', aadhaar_ctx: 'aadhaar 2345 ',
  password_eq: 'password = ', sk_dash: 'sk-', jwt_ish: 'eyJ', db_uri: 'mongodb://a:', you_are_now: 'you are now ',
  hinglish: 'pichle saare instructions ', roleplay: 'act like my grandma who used to ', exfil: 'send other users ',
  nested_json: '{"a":', number_words: 'nine ', upi_ish: 'a.b@', pan_ish: 'ABCPV ',
};
const INPUTS: Record<string, string> = Object.fromEntries(Object.entries(UNITS).map(([k, u]) => [k, pump(u)]));
INPUTS.pem_open = '-----BEGIN PRIVATE KEY-----' + 'A'.repeat(SIZE - 28) + '!';

// 4. One worker per regex / per detector, all inputs, hard timeout. The worker reports each input as it starts,
// so a timeout names the input that hung.
const WORKER = new URL('./redos-worker.ts', import.meta.url);
type Timing = { worst: number; worstInput: string; error?: string };

function timeJob(data: Record<string, unknown>): Promise<Timing> {
  return new Promise((done) => {
    const w = new Worker(WORKER, { workerData: { ...data, inputs: INPUTS }, execArgv: ['--import', 'tsx'] });
    let current = '', worst = 0, worstInput = '';
    const finish = (t: Timing) => { clearTimeout(timer); void w.terminate(); done(t); };
    const timer = setTimeout(() => finish({ worst: Infinity, worstInput: current, error: `timeout > ${WORKER_TIMEOUT_MS / 1000} s` }), WORKER_TIMEOUT_MS);
    w.on('message', (m: { started?: string; input?: string; ms?: number; done?: boolean }) => {
      if (m.started) current = m.started;
      if (m.input && m.ms! > worst) { worst = m.ms!; worstInput = m.input; }
      if (m.done) finish({ worst, worstInput });
    });
    w.once('error', (e) => finish({ worst: Infinity, worstInput: current, error: e.message }));
  });
}

async function pooled<T, R>(items: T[], fn: (x: T) => Promise<R>, label: (x: T) => string): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0, finished = 0;
  const size = Math.max(2, Math.min(8, cpus().length - 1));
  await Promise.all(Array.from({ length: size }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i]);
      process.stderr.write(`\r${++finished}/${items.length} ${label(items[i])}          `);
    }
  }));
  process.stderr.write('\n');
  return out;
}

const regexTimes = await pooled(regexes, (r) => timeJob({ mode: 'regex', source: r.source, flags: r.flags }), (r) => r.id);
const rows = regexes.map((r, i) => ({ r, ...regexTimes[i] })).sort((a, b) => b.worst - a.worst);

// 5. Whole detectors at 50 KB (how regexes combine, plus normalisation and decoding), same isolation.
const DETECTOR_NAMES = ['aadhaar', 'vid', 'pan', 'phone', 'card', 'ifsc', 'upi', 'bankAccount', 'email', 'secrets', 'canary', 'confidential', 'normalise', 'decodeBlocks', 'detectInjection', 'findLinks', 'detectAll'];
const detTimes = await pooled(DETECTOR_NAMES, (name) => timeJob({ mode: 'detector', name }), (n) => n);
const detRows = DETECTOR_NAMES.map((name, i) => ({ name, ...detTimes[i] })).sort((a, b) => b.worst - a.worst);

const fmt = (x: number) => (Number.isFinite(x) ? (x < 10 ? x.toFixed(2) : x.toFixed(1)) : '∞');
const flagged = rows.filter((x) => x.worst > LIMIT_MS);
const flaggedDet = detRows.filter((x) => x.worst > LIMIT_MS);
const lines = [
  '# ReDoS audit: detector regexes',
  '',
  `${regexes.length} regexes (${regexes.filter((r) => r.kind === 'literal').length} literals from the AST, ${regexes.filter((r) => r.kind === 'constructed').length} built with \`new RegExp\`) × ${Object.keys(INPUTS).length} adversarial inputs of ${SIZE.toLocaleString()} chars, each ending in a mismatch. Limit ${LIMIT_MS} ms per run; each regex runs in its own worker with a ${WORKER_TIMEOUT_MS / 1000} s timeout. ${cpus()[0]?.model ?? ''}, ${platform()} ${arch()}, Node ${process.version}. Generated by \`packages/detectors/scripts/redos-audit.ts\`; read-only.`,
  '',
  flagged.length ? `**${flagged.length} regex(es) over ${LIMIT_MS} ms on a single input.**` : `**No regex exceeded ${LIMIT_MS} ms.**`,
  flaggedDet.length ? `**${flaggedDet.length} detector(s) over ${LIMIT_MS} ms at 50 KB:** ${flaggedDet.map((d) => d.name).join(', ')}.` : `No whole detector exceeded ${LIMIT_MS} ms at 50 KB.`,
  '',
  '## Slowest 15 regexes',
  '',
  '| Id | Where | Kind | Worst ms | Worst input |',
  '| --- | --- | --- | --- | --- |',
  ...rows.slice(0, 15).map((x) => `| ${x.r.id} | \`${x.r.where}\` | ${x.r.kind} | ${x.error ? x.error : fmt(x.worst)} | ${x.worstInput} |`),
  '',
  '## Whole detectors at 50 KB (worst over all inputs)',
  '',
  '| Detector | Worst ms | Worst input |',
  '| --- | --- | --- |',
  ...detRows.map((x) => `| ${x.name} | ${x.error ? x.error : fmt(x.worst)} | ${x.worstInput} |`),
  '',
  `Inputs: ${Object.keys(INPUTS).join(', ')}.`,
  '',
];
const report = lines.join('\n');
const outAt = process.argv.indexOf('--out');
if (outAt >= 0) { const out = resolve(process.argv[outAt + 1]); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, report); console.log(`wrote ${relative(process.cwd(), out)}`); }
console.log(report);
if (flagged.length || flaggedDet.length) process.exitCode = 1;
process.exit();
