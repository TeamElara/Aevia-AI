/** Reproducible integration exercise. Never represents model-backed/frozen evidence. */
import { spawn } from 'node:child_process';
import { startGatewayDemo } from './run-gateway-demo.js';
const demo = await startGatewayDemo(0, { baseline: true });
try {
  for (const baseline of [false, true]) {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['eval/run.mjs', 'eval/dev.jsonl', 'eval/heldout.jsonl', 'eval/robustness.jsonl', '--gateway', demo.url, '--out', 'results/continuation-simulated', ...(baseline ? ['--baseline'] : [])], { stdio: 'inherit' });
      child.on('error', reject); child.on('exit', resolve);
    });
    if (code !== 0) throw new Error('Evaluator failed');
  }
} finally { await demo.close(); }
