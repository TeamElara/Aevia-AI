const allowedCodes = new Set(['STARTED', 'STOPPED', 'START_FAILED', 'REQUEST_FAILED', 'UNCAUGHT_EXCEPTION', 'UNHANDLED_REJECTION']);
export function safeLog(code: string, fields: { port?: number; status?: number } = {}): void {
  const safe: Record<string, string | number> = { code: allowedCodes.has(code) ? code : 'REQUEST_FAILED' };
  if (Number.isInteger(fields.port)) safe.port = fields.port!;
  if (Number.isInteger(fields.status)) safe.status = fields.status!;
  process.stdout.write(`${JSON.stringify(safe)}\n`);
}
/** Third-party console arguments can contain prompts, provider bodies or exception traces.
 * Drop their arguments entirely instead of attempting a fallible regex scrub.
 */
export function installConsolePrivacyFilter(): void {
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const) {
    console[method] = () => { process.stderr.write('{"code":"REDACTED_CONSOLE_EVENT"}\n'); };
  }
}
