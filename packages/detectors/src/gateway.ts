// Server entry point for the gateway: DETECTOR_MODULE=packages/detectors/src/gateway.ts
//
//   LEAKSHIELD_CLASSIFIER=off (default)  rules only, same as src/index.ts
//   LEAKSHIELD_CLASSIFIER=fp32           pinned upstream DeBERTa (downloads ~713 MB on first run)
//   LEAKSHIELD_CLASSIFIER=q8             with LEAKSHIELD_CLASSIFIER_MODEL=<local int8 model>
//   LEAKSHIELD_CLASSIFIER_CACHE=<dir>    model cache directory
//
// The model loads once, at import, so the gateway's startup pays the ~2 s load and not the first request.
// If loading fails the import throws: the gateway reports not-ready instead of silently running rules-only.

import { createTransformersClassifier, detectWithClassifier, type InjectionClassifier } from './classifier';
import type { DetectorContext, Finding } from './types';

const mode = (process.env.LEAKSHIELD_CLASSIFIER ?? 'off').trim().toLowerCase();

let classifier: InjectionClassifier | null = null;
if (mode !== 'off' && mode !== '') {
  classifier = await createTransformersClassifier({
    dtype: mode,
    cacheDir: process.env.LEAKSHIELD_CLASSIFIER_CACHE || undefined,
    localModel: process.env.LEAKSHIELD_CLASSIFIER_MODEL || undefined,
  });
}

/** Which classifier this process loaded: 'off', 'fp32', 'q8', … */
export const classifierMode = classifier ? mode : 'off';

export function detectAll(text: string, ctx: DetectorContext): Finding[] | Promise<Finding[]> {
  return detectWithClassifier(text, ctx, classifier);
}

export * from './index';
