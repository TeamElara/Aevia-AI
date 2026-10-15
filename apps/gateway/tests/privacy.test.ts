import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Audit } from '../src/audit.js';
import { installConsolePrivacyFilter, safeLog } from '../src/logger.js';
import { employee, harness } from './helpers.js';

afterEach(() => vi.restoreAllMocks());
describe('privacy boundaries', () => {
  it('drops all third-party console arguments and stack traces', () => {
    const output = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const originals = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug, trace: console.trace, dir: console.dir, table: console.table };
    try {
      installConsolePrivacyFilter();
      console.log('2345 6789 0124'); console.error(new Error('AKIAABCDEFGHIJKLMNOP')); console.dir({ PAN: 'ABCDE1234F' });
      const captured = JSON.stringify(output.mock.calls);
      for (const value of ['2345', 'AKIA', 'ABCDE']) expect(captured).not.toContain(value);
      expect(captured).toContain('REDACTED_CONSOLE_EVENT');
    } finally { Object.assign(console, originals); }
  });
  it('limits structured logging to known event codes and numeric metadata', () => {
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    safeLog('2345 6789 0124', { port: 3001, raw: 'ABCDE1234F' } as never);
    expect(output.mock.calls[0]?.[0]).toBe('{"code":"REQUEST_FAILED","port":3001}\n');
  });
  it('uses domain-separated keyed fingerprints rather than plain hashes', () => {
    const audit = new Audit({ insert: async () => {} }, 'test-key');
    expect(audit.pseudo(employee)).not.toBe(createHash('sha256').update(employee.id).digest('hex'));
    expect(audit.fingerprint('user', 'same')).not.toBe(audit.fingerprint('value', 'same'));
  });
  it('keeps five seeded values out of audit events throughout block, mask and output-redaction flows', async () => {
    const h = harness({ respond: () => 'Other record 9876543210' });
    try {
      for (const prompt of ['2345 6789 0124', 'ABCDE1234F', '9876543210', 'AKIAABCDEFGHIJKLMNOP', 'hello']) {
        await h.gateway.run(employee, { messages: [{ role: 'user', content: prompt }] });
      }
      const auditText = JSON.stringify(h.events);
      for (const value of ['2345 6789 0124', 'ABCDE1234F', '9876543210', 'AKIAABCDEFGHIJKLMNOP', 'Other record']) expect(auditText).not.toContain(value);
    } finally { h.close(); }
  });
});
