import { performance } from 'node:perf_hooks';
import { scanIngest } from '../../apps/gateway/src/retrieval/ingest.js';
import { documents } from '../../seed/corpus.js';
const samples = [];
for (let i = 0; i < 1100; i++) {
  const start = performance.now(); documents.forEach(d => scanIngest(d.text));
  if (i >= 100) samples.push(performance.now() - start);
}
samples.sort((a,b) => a-b);
console.log(JSON.stringify({ scope: 'local ingest scanner only; ten synthetic documents per sample; not gateway overhead', node: process.version, samples: samples.length, p50_ms: samples[499], p95_ms: samples[949] }, null, 2));
