import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { sanitiseLinks } from '../src/sanitise.js';
import { findLinks } from '../../../packages/detectors/src/links.js';

function time(text: string, helper: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sanitise-redos.worker.ts', import.meta.url), {
      workerData: { text, helper }, execArgv: ['--import', 'tsx'],
    });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Sanitizer worker exceeded 3 seconds')); }, 3000);
    worker.once('message', (ms: number) => { clearTimeout(timer); void worker.terminate(); resolve(ms); });
    worker.once('error', error => { clearTimeout(timer); void worker.terminate(); reject(error); });
  });
}

describe('response sanitizer ReDoS', () => {
  for (const unit of ['![a](', '<img ', '[a](//']) {
    for (const helper of [false, true]) {
      it(`50 KB ${unit} is bounded (detector helper ${helper})`, async () => {
        const text = unit.repeat(Math.ceil(50_000 / unit.length)).slice(0, 49_999) + '!';
        expect(await time(text, helper)).toBeLessThan(50);
      });
    }
  }

  it('removes images even on approved hosts and over the structured URL limit', () => {
    for (const helper of [undefined, findLinks]) {
      expect(sanitiseLinks('![x](https://trusted.test/a)', ['trusted.test'], helper)).not.toContain('![');
      expect(sanitiseLinks(`![x](https://trusted.test/${'a'.repeat(10_000)})`, ['trusted.test'], helper)).not.toContain('![');
    }
  });
  it('removes markup and protocol-relative link destinations', () => {
    expect(sanitiseLinks('<img src="https://evil.test/x"> [x](//evil.test/p)', [])).not.toContain('evil.test');
  });
  it('continues sanitizing destinations after 50 KB of ordinary text', () => {
    const safe = sanitiseLinks('a'.repeat(50_000) + ' https://evil.test/?secret=fixture', [], findLinks);
    expect(safe).not.toContain('evil.test');
  });
});
