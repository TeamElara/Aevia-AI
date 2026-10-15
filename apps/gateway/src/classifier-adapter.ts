import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Full-precision CPU path validated by Alwaz's spike. Int8 is not selectable: recorded attacks were misclassified. */
export async function loadRuntimeClassifier(cacheDir = '.cache/classifier') {
  const mod = await import(pathToFileURL(resolve('packages/detectors/src/index.ts')).href);
  const backend = await mod.createTransformersClassifier({ dtype: 'fp32', cacheDir: resolve(cacheDir) });
  return {
    name: 'node_fp32',
    async scoreBatch(texts: string[]): Promise<number[]> {
      return backend.scoreBatch(texts);
    },
    close: () => backend.close?.(),
  };
}
