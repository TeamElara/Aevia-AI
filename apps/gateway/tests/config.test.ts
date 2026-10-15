import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

// Every variable loadConfig reads is set here, so a teammate's own .env cannot change the result.
const base: Record<string, string> = {
  HOST: '127.0.0.1', JWT_SECRET: 'j'.repeat(32), AUDIT_HMAC_SECRET: 'a'.repeat(32), LLM_PROVIDER: 'ollama', OLLAMA_MODEL: 'fixture',
  EVAL_MODE: 'false', DEMO_AUTH: 'false', BASELINE_MODE: 'false', API_KEYS_JSON: '[]', CORS_ORIGIN: 'http://localhost:5173',
};
const saved = { ...process.env };
function load(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries({ ...base, ...env })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  return loadConfig();
}
afterEach(() => { process.env = { ...saved }; });

describe('security warnings flag', () => {
  it('is on by default when the gateway has DB-backed identities', () => {
    expect(load({ RETRIEVAL_MODULE: 'apps/gateway/src/retrieval/index.js', SECURITY_ESCALATION_ENABLED: undefined })).toMatchObject({ SECURITY_ESCALATION: true, SECURITY_ESCALATION_EXPLICIT: false });
  });
  it('stays off by default where it cannot work, without stopping the gateway', () => {
    expect(load({ RETRIEVAL_MODULE: '', SECURITY_ESCALATION_ENABLED: undefined }).SECURITY_ESCALATION).toBe(false);
  });
  it('can be turned off, and refuses to start when forced on without identities', () => {
    expect(load({ RETRIEVAL_MODULE: 'apps/gateway/src/retrieval/index.js', SECURITY_ESCALATION_ENABLED: 'false' }).SECURITY_ESCALATION).toBe(false);
    expect(() => load({ RETRIEVAL_MODULE: '', SECURITY_ESCALATION_ENABLED: 'true' })).toThrow(/DB-backed identities/);
  });
});
