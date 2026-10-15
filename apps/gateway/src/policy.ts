import { readFileSync, watchFile, unwatchFile } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import type { Action, Finding } from '../../../types.js';
import { GatewayError } from './errors.js';

const schema = z.object({
  version: z.string().regex(/^[a-zA-Z0-9._-]{1,40}$/),
  injection: z.object({ warn: z.number().min(0).max(1), block: z.number().min(0).max(1) })
    .refine(v => v.warn < v.block),
  actions: z.object({
    pii: z.enum(['mask', 'block']),
    email: z.enum(['warn', 'mask', 'block']),
    ifsc: z.enum(['warn', 'mask', 'block']).default('warn'),
    secret: z.literal('block'),
  }).strict(),
  allowed_link_hosts: z.array(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)).max(30),
}).strict();
export type Policy = z.infer<typeof schema>;
export const actionOrder: Action[] = ['allow', 'warn', 'mask', 'redact', 'quarantine', 'deny', 'require_approval', 'block'];
export function strictest(actions: Action[]): Action {
  return actions.reduce((a, b) => actionOrder.indexOf(a) >= actionOrder.indexOf(b) ? a : b, 'allow');
}
export function findingAction(f: Finding, policy: Policy): Action {
  if (['CANARY', 'FINGERPRINT'].includes(f.category)) return 'block';
  if (f.category === 'SECRET' || f.category === 'CREDENTIAL' || f.category === 'PRIVATE_KEY') return 'block';
  if (f.category === 'INJECTION') {
    return f.score >= policy.injection.block ? 'block' : f.score >= policy.injection.warn ? 'warn' : 'allow';
  }
  if (f.category === 'AADHAAR' && f.score < 0.8) return 'warn';
  if (f.source === 'response') return 'redact';
  if (f.category === 'EMAIL') return policy.actions.email;
  if (f.category === 'IFSC') return policy.actions.ifsc;
  // Document disclosure is additionally governed by its external_llm flag; the label is never reversible.
  if (f.category === 'CONFIDENTIAL') return f.source === 'document' ? 'redact' : 'block';
  return policy.actions.pii;
}
/** Invalid reloads fail closed until a valid, newly versioned policy is supplied. */
export class PolicyStore {
  private current?: Policy;
  private valid = false;
  constructor(public readonly path: string, watch = true) {
    this.reload();
    if (watch) watchFile(path, { interval: 500, persistent: false }, this.reload);
  }
  reload = (): void => {
    try {
      const next = schema.parse(parse(readFileSync(this.path, 'utf8')));
      if (this.current && JSON.stringify(next) !== JSON.stringify(this.current) && next.version === this.current.version) {
        this.valid = false;
        return;
      }
      this.current = next;
      this.valid = true;
    } catch { this.valid = false; }
  };
  snapshot(): Readonly<Policy> {
    if (!this.valid || !this.current) throw new GatewayError('POLICY_UNAVAILABLE');
    return structuredClone(this.current);
  }
  close(): void { unwatchFile(this.path, this.reload); }
}
