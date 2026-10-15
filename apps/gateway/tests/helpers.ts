/** Deterministic test fixtures ONLY. Not a substitute for Ojaswi's production detectors. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import type { AuditEvent, DetectAll, Finding, Message, Provider, User } from '../../../types.js';
import { Audit } from '../src/audit.js';
import { Auth } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { Gateway } from '../src/pipeline.js';
import { PolicyStore } from '../src/policy.js';
import { Scanner } from '../src/scanner.js';
import { ConversationVault } from '../src/vault.js';

export const employee: User = { id: 'asha', groups: ['employee'] };
export const admin: User = { id: 'admin', groups: ['admin'] };
export const secret = 'test-only-independent-signing-secret-32-chars';
export const policyText = `version: "1"\ninjection:\n  warn: 0.6\n  block: 0.85\nactions:\n  pii: mask\n  email: warn\n  secret: block\nallowed_link_hosts: []\n`;
export const testDetector: DetectAll = (text, ctx) => {
  const found: Finding[] = [];
  const patterns = [
    ['AADHAAR', /\b2345[ -]?6789[ -]?0124\b/g],
    ['PAN', /\bABCDE1234F\b/g],
    ['PHONE', /\b9876543210\b/g],
    ['SECRET', /AKIA[A-Z0-9]{16}/g],
    ['INJECTION', /ignore previous instructions/gi],
  ] as const;
  for (const [category, pattern] of patterns) for (const m of text.matchAll(pattern)) {
    found.push({ category, source: ctx.source, start: m.index!, end: m.index! + m[0].length, score: 1, ruleId: `test.${category}`, via: 'raw' });
  }
  return found;
};
export function harness(options: { detect?: DetectAll; respond?: (messages: readonly Message[]) => string; external?: boolean; evalMode?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aevia-test-'));
  const path = join(dir, 'policy.yaml');
  writeFileSync(path, policyText);
  const policies = new PolicyStore(path, false);
  const events: AuditEvent[] = [];
  const insert = vi.fn(async (event: AuditEvent) => { events.push(structuredClone(event)); });
  const audit = new Audit({ insert }, 'test-only-audit-hmac-secret-32-characters');
  const provider: Provider = {
    external: options.external ?? true, model: 'test-model',
    complete: vi.fn(async (messages, onAttempt) => { onAttempt(); return { content: options.respond?.(messages) ?? messages.at(-1)!.content, model: 'test-model' }; }),
  };
  const vault = new ConversationVault();
  const deps = { provider, audit, policies, vault, scanner: new Scanner(options.detect ?? testDetector), evalMode: options.evalMode ?? false };
  const gateway = new Gateway(deps);
  const auth = new Auth(secret);
  const app = createApp({ gateway, auth, audit, policies, ready: () => true, corsOrigin: 'http://localhost:5173' });
  return { ...deps, gateway, app, events, insert, dir, path, close: () => { policies.close(); vault.close(); rmSync(dir, { recursive: true, force: true }); } };
}
