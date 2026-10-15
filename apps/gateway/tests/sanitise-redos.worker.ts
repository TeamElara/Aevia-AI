import { parentPort, workerData } from 'node:worker_threads';
import { sanitiseLinks } from '../src/sanitise.js';
import { findLinks } from '../../../packages/detectors/src/index';

const { text, helper } = workerData as { text: string; helper: boolean };
const run = () => sanitiseLinks(text, [], helper ? findLinks : undefined);
run();
let best = Infinity;
for (let i = 0; i < 3; i++) {
  const at = performance.now(); run(); best = Math.min(best, performance.now() - at);
}
parentPort!.postMessage(best);
