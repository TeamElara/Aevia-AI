import { z } from 'zod';
import type { DetectAll, DetectionContext, Finding } from '../../../types.js';
import { GatewayError } from './errors.js';

const finding = z.object({
  category: z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/),
  source: z.enum(['prompt', 'document', 'response']),
  start: z.number().int().min(0), end: z.number().int().min(0),
  score: z.number().min(0).max(1),
  ruleId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/),
  via: z.enum(['raw', 'normalised', 'decoded']),
}).strict();

export class Scanner {
  constructor(private readonly detect: DetectAll, private readonly timeoutMs = 5000) {}
  async scan(text: string, ctx: DetectionContext): Promise<Finding[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => this.detect(text, ctx)),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), this.timeoutMs); }),
      ]);
      const parsed = z.array(finding).max(1000).parse(result);
      if (parsed.some(f => f.source !== ctx.source || f.end > text.length || f.end <= f.start)) throw new Error('invalid span');
      // Catch marker disclosure independently of the optional classifier.
      for (const canary of ctx.canaries) {
        let at = text.indexOf(canary);
        while (at !== -1) {
          parsed.push({ category: 'CANARY', source: ctx.source, start: at, end: at + canary.length, score: 1, ruleId: 'canary.exact', via: 'raw' });
          at = text.indexOf(canary, at + canary.length);
        }
      }
      return parsed;
    } catch { throw new GatewayError('SCANNER_UNAVAILABLE'); }
    finally { clearTimeout(timer); }
  }
}
