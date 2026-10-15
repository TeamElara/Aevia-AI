// Worker for redos-audit.ts: times one regex or one detector over every input, reporting after each input
// so the parent knows which input was running if it has to kill the worker.

import { parentPort, workerData } from 'node:worker_threads';

type Job =
  | { mode: 'regex'; source: string; flags: string; inputs: Record<string, string> }
  | { mode: 'detector'; name: string; inputs: Record<string, string> };

const job = workerData as Job;
const ctx = { source: 'prompt' as const, canaries: ['LS-CANARY-0123456789abcdef'], knownUsers: ['asha', 'ravi', 'meera', 'ceo', 'admin'], currentUser: 'asha', protectedPhrases: ['Project Garuda'] };

async function detectorFn(name: string): Promise<(t: string) => unknown> {
  const det = await import('../src/index');
  const pii = await import('../src/pii');
  const sec = await import('../src/secrets');
  const conf = await import('../src/confidential');
  const fns: Record<string, (t: string) => unknown> = {
    aadhaar: (t) => pii.aadhaar(t, ctx), vid: (t) => pii.vid(t, ctx), pan: (t) => pii.pan(t, ctx), phone: (t) => pii.phone(t, ctx),
    card: (t) => pii.card(t, ctx), ifsc: (t) => pii.ifsc(t, ctx), upi: (t) => pii.upi(t, ctx), bankAccount: (t) => pii.bankAccount(t, ctx),
    email: (t) => pii.email(t, ctx), secrets: (t) => sec.secrets(t, ctx), canary: (t) => conf.canary(t, ctx), confidential: (t) => conf.confidential(t, ctx),
    normalise: (t) => det.normalise(t), decodeBlocks: (t) => det.decodeBlocks(t), detectInjection: (t) => det.detectInjection(t, ctx),
    findLinks: (t) => det.findLinks(t), detectAll: (t) => det.detectAll(t, ctx),
  };
  return fns[name];
}

const run: (t: string) => unknown =
  job.mode === 'regex'
    ? (t) => {
        const re = new RegExp(job.source, job.flags.includes('g') ? job.flags : job.flags + 'g');
        let n = 0;
        for (const _ of t.matchAll(re)) if (++n > 200_000) break;
      }
    : await detectorFn(job.name);

for (const [input, text] of Object.entries(job.inputs)) {
  parentPort!.postMessage({ started: input });
  const t0 = performance.now();
  run(text);
  parentPort!.postMessage({ input, ms: performance.now() - t0 });
}
parentPort!.postMessage({ done: true });
