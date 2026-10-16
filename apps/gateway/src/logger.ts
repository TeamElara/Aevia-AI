const allowedCodes = new Set(['STARTED', 'STOPPED', 'START_FAILED', 'REQUEST_FAILED', 'UNCAUGHT_EXCEPTION', 'UNHANDLED_REJECTION', 'SECURITY_WARNINGS_OFF']);
export function safeLog(code: string, fields: { port?: number; status?: number; phase?: number; failure?: number } = {}): void {
  const safe: Record<string, string | number> = { code: allowedCodes.has(code) ? code : 'REQUEST_FAILED' };
  if (Number.isInteger(fields.port)) safe.port = fields.port!;
  if (Number.isInteger(fields.status)) safe.status = fields.status!;
  if (Number.isInteger(fields.phase) && fields.phase! >= 0 && fields.phase! <= 20) safe.phase = fields.phase!;
  if (Number.isInteger(fields.failure) && fields.failure! >= 0 && fields.failure! <= 10) safe.failure = fields.failure!;
  process.stdout.write(`${JSON.stringify(safe)}\n`);
}
/** Fixed numeric diagnostics: never emit exception messages, URLs or configuration values. */
export function startupFailure(error: unknown, phase: number): void {
  const e = error as { name?: string; code?: unknown };
  const kinds = ['ZodError', 'MongoServerSelectionError', 'MongoNetworkError', 'MongoServerError', 'MongoParseError', 'MongoAPIError', 'GatewayError', 'Error'];
  safeLog('START_FAILED', { phase, failure: kinds.indexOf(e?.name ?? '') + 1, ...(typeof e?.code === 'number' ? { status: e.code } : {}) });
}
/** Third-party console arguments can contain prompts, provider bodies or exception traces.
 * Drop their arguments entirely instead of attempting a fallible regex scrub.
 */
export function installConsolePrivacyFilter(): void {
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const) {
    console[method] = () => { process.stderr.write('{"code":"REDACTED_CONSOLE_EVENT"}\n'); };
  }
}
