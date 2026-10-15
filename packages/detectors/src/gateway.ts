// Server entry point for the gateway: DETECTOR_MODULE=packages/detectors/src/gateway.ts
//
//   LEAKSHIELD_CLASSIFIER=off (default)  rules only, same as src/index.ts
//   LEAKSHIELD_CLASSIFIER=fp32           pinned upstream DeBERTa (downloads ~713 MB on first run)
//   LEAKSHIELD_CLASSIFIER_CACHE=<dir>    model cache directory
//
// int8 is refused: in the team's spike (docs/CLASSIFIER-GATEWAY.md) the locally quantised model labelled all
// three recorded attacks SAFE, which fp32 caught. Enabling it would quietly turn the classifier off.
//
// The model loads once, at import, so the gateway's startup pays the ~2 s load and not the first request.
// If loading fails the import throws: the gateway reports not-ready instead of silently running rules-only.

import { createTransformersClassifier, detectWithClassifier, type InjectionClassifier } from './classifier';
import type { DetectorContext, Finding } from './types';

const mode = (process.env.LEAKSHIELD_CLASSIFIER ?? 'off').trim().toLowerCase() || 'off';

/** Validated LEAKSHIELD_CLASSIFIER value. Exported for tests. */
export function classifierModeFrom(value: string): 'off' | 'fp32' {
  if (value === 'off' || value === 'fp32') return value;
  if (value === 'q8' || value === 'int8') {
    throw new Error('LEAKSHIELD_CLASSIFIER=q8 is disabled: the int8 model labelled recorded attacks SAFE (docs/CLASSIFIER-GATEWAY.md). Use fp32 or off.');
  }
  throw new Error(`LEAKSHIELD_CLASSIFIER must be "off" or "fp32", got "${value}"`);
}

let classifier: InjectionClassifier | null = null;
if (classifierModeFrom(mode) === 'fp32') {
  classifier = await createTransformersClassifier({
    dtype: 'fp32',
    cacheDir: process.env.LEAKSHIELD_CLASSIFIER_CACHE || undefined,
    localModel: process.env.LEAKSHIELD_CLASSIFIER_MODEL || undefined,
  });
}

/** Which classifier this process loaded: 'off' or 'fp32'. */
export const classifierMode = classifier ? mode : 'off';

export function detectAll(text: string, ctx: DetectorContext): Finding[] | Promise<Finding[]> {
  return detectWithClassifier(text, ctx, classifier);
}

export * from './index';
