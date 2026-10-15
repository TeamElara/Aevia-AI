import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Full-precision CPU path validated by Alwaz's spike. Int8 is not selectable: recorded attacks were misclassified. */
export async function loadRuntimeClassifier(cacheDir = '.cache/classifier') {
  const mod = await import(pathToFileURL(resolve('apps/gateway/src/retrieval/classifier.js')).href);
  const backend = await mod.loadClassifier({ dtype: 'fp32', cacheDir: resolve(cacheDir) });
  return {
    name: 'node_fp32',
    async scoreBatch(texts: string[]): Promise<number[]> {
      const scores: number[] = [];
      for (const text of texts) scores.push(await backend.classify(text));
      return scores;
    },
    close: () => backend.close(),
  };
}
