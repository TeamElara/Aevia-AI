import { parentPort, workerData } from 'node:worker_threads';
import { detectAll, findLinks } from '../src';
import type { DetectorContext } from '../src';

const { detector, text, ctx } = workerData as { detector: 'detectAll' | 'findLinks'; text: string; ctx: DetectorContext };
const run = () => detector === 'detectAll' ? detectAll(text, ctx) : findLinks(text);
run();
let best = Infinity;
for (let i = 0; i < 3; i++) {
  const at = performance.now();
  run();
  best = Math.min(best, performance.now() - at);
}
parentPort!.postMessage(best);
