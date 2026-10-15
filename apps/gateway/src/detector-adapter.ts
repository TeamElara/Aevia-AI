import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DetectAll, Finding } from '../../../types.js';
import { GatewayError } from './errors.js';
import type { FindLinks } from './sanitise.js';

/** Use the detector team's public boundaries, preserving their original rule IDs. */
export interface LocalClassifier { name: string; scoreBatch(texts: string[]): Promise<number[]>; }
export async function loadDetectorAdapter(modulePath: string, classifier?: LocalClassifier) {
  const mod = await import(pathToFileURL(resolve(modulePath)).href);
  for (const name of ['safeDetectAll', 'detectResponse', 'detectSplitSecrets', 'findLinks']) {
    if (typeof mod[name] !== 'function') throw new GatewayError('DETECTOR_CONFIG_INVALID');
  }
  const detect: DetectAll = async (text, ctx) => {
    if (ctx.source === 'response') return mod.detectResponse(text, { ...ctx, canaries: [...ctx.canaries] });
    const result = await mod.safeDetectAll(text, { ...ctx, canaries: [...ctx.canaries] });
    if (!result?.ok || !Array.isArray(result.findings)) throw new GatewayError('SCANNER_UNAVAILABLE');
    if (classifier && ctx.source === 'prompt' && ctx.classify && text.trim() && mod.shouldRunClassifier(mod.injectionScore(result.findings))) {
      const scored = await mod.classifyInjection(text, ctx, classifier);
      if (!scored?.ok) throw new GatewayError('SCANNER_UNAVAILABLE');
      if (scored.finding) result.findings.push(scored.finding);
    }
    return result.findings;
  };
  const splitSecrets = (messages: string[]): Finding[] => {
    const found = mod.detectSplitSecrets(messages);
    if (!Array.isArray(found)) throw new GatewayError('SCANNER_UNAVAILABLE');
    return found.map(({ category, source, start, end, score, ruleId, via }: Finding) => ({ category, source, start, end, score, ruleId, via }));
  };
  return { detect, splitSecrets, findLinks: mod.findLinks as FindLinks };
}
