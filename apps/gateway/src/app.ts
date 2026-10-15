import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import type { AuditEvent, User } from '../../../types.js';
import { Audit } from './audit.js';
import { Auth, issueToken } from './auth.js';
import { GatewayError } from './errors.js';
import { Gateway } from './pipeline.js';
import { PolicyStore } from './policy.js';

const messages = z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().min(1).max(30_000) }).strict()).min(1).max(20);
const chatSchema = z.object({ prompt: z.string().min(1).max(30_000), conversation_id: z.uuid().optional(), approval_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional() }).strict();
const completionSchema = z.object({ model: z.literal('leakshield').default('leakshield'), messages, stream: z.boolean().default(false), n: z.literal(1).optional() }).strict();
interface Options { gateway: Gateway; auth: Auth; audit: Audit; policies: PolicyStore; ready: () => boolean; corsOrigin?: string; demoAuth?: boolean; signingSecret?: string; evalMode?: boolean; }
const identity = (res: Response): User => res.locals.user as User;
const admin = (res: Response): void => { if (!identity(res).groups.includes('admin')) throw new GatewayError('FORBIDDEN', 403); };
export function createApp(options: Options) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use((req, res, next) => {
    if (req.headers.origin) {
      if (req.headers.origin !== options.corsOrigin) return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED' } });
      res.setHeader('Access-Control-Allow-Origin', options.corsOrigin!);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'alive' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/ready', (_req, res) => {
    let ready = options.ready();
    try { options.policies.snapshot(); } catch { ready = false; }
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'dependencies_unavailable' });
  });
  const demoUsers = {
    asha: { id: 'asha', name: 'Asha Rao', role: 'Employee', groups: ['employee'] },
    ravi: { id: 'ravi', name: 'Ravi', role: 'HR', groups: ['employee', 'hr'] },
    meera: { id: 'meera', name: 'Meera', role: 'Engineering', groups: ['employee', 'engineering'] },
    ceo: { id: 'ceo', name: 'CEO', role: 'Executive', groups: ['employee', 'admin-exec'] },
    admin: { id: 'admin', name: 'Admin', role: 'Administrator', groups: ['admin'] },
  };
  let loginWindow = Date.now(); let logins = 0;
  app.post('/api/auth/login', express.json({ limit: '1kb' }), async (req, res) => {
    if (!options.demoAuth || !options.signingSecret) throw new GatewayError('DEMO_AUTH_DISABLED', 403);
    if (Date.now() - loginWindow > 60_000) { loginWindow = Date.now(); logins = 0; }
    if (++logins > 30) throw new GatewayError('RATE_LIMITED', 429);
    const body = z.object({ user: z.enum(['asha', 'ravi', 'meera', 'ceo', 'admin']) }).strict().parse(req.body);
    const user = demoUsers[body.user];
    res.json({ token: await issueToken({ id: user.id, groups: user.groups }, options.signingSecret), user });
  });
  app.use(async (req, res, next) => {
    res.locals.user = await options.auth.authenticate(req.headers.authorization);
    next();
  });
  // Bounded per-identity burst budget; authentication precedes JSON parsing.
  const budgets = new Map<string, { reset: number; count: number }>();
  app.use((_req, res, next) => {
    const now = Date.now();
    for (const [id, value] of budgets) if (value.reset <= now) budgets.delete(id);
    const id = identity(res).id;
    const budget = budgets.get(id) ?? { reset: now + 60_000, count: 0 };
    budgets.set(id, budget);
    if (++budget.count > 60) return res.status(429).json({ error: { code: 'RATE_LIMITED' } });
    next();
  });
  app.use(express.json({ limit: '256kb', strict: true }));
  const chat = async (req: Request, res: Response) => {
    const body = chatSchema.parse(req.body);
    const result = await options.gateway.run(identity(res), { messages: [{ role: 'user', content: body.prompt }], conversationId: body.conversation_id, approvalId: body.approval_id });
    res.json(result);
  };
  app.post('/chat', chat);
  app.post('/api/chat', async (req, res) => {
    // Never silently execute protected requests when the runner thinks it is measuring a baseline.
    if (req.headers['x-leakshield-mode'] !== undefined) throw new GatewayError('OFFLINE_BASELINE_REQUIRED', 501);
    const body = z.object({ message: z.string().min(1).max(30_000), conversation_id: z.uuid().nullable().optional(), approval_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional() }).strict().parse(req.body);
    const result = await options.gateway.run(identity(res), { messages: [{ role: 'user', content: body.message }], conversationId: body.conversation_id ?? undefined, approvalId: body.approval_id });
    const { findings, approval, captured_payload, ...rest } = result;
    const stageNames: Record<string, string> = { prompt: 'PII', retrieval: 'ACL', documents: 'Docs', outbound: 'Outbound', llm: 'LLM', response: 'Out', restore: 'Restore' };
    res.json({ ...rest, action: result.action === 'block' && result.provider_calls > 0 ? 'block_response' : result.action,
      stage_ms: Object.fromEntries(Object.entries(result.stage_ms).map(([key, ms]) => [stageNames[key] ?? key, Math.round(ms * 100) / 100])),
      findings: findings.map(({ category, source, via, ruleId }) => ({ category, source, via, ruleId })),
      rule_ids: [...new Set(findings.map(f => f.ruleId))], ...(approval ? { approval_id: approval.id } : {}),
      ...(options.evalMode && req.headers['x-eval-capture'] === '1' ? { eval: { provider_calls: result.provider_calls, provider_payload: captured_payload?.map(m => m.content).join('\n') ?? null } } : {}),
    });
  });
  app.post('/v1/scan', async (req, res) => {
    const body = z.object({ text: z.string().min(1).max(30_000) }).strict().parse(req.body);
    res.json(await options.gateway.inspect(identity(res), body.text));
  });
  app.get('/policy', (_req, res) => { admin(res); res.json(options.policies.snapshot()); });
  app.get(['/events', '/api/events'], (req, res) => {
    admin(res);
    if (options.audit.events.listenerCount('audit') >= 50) throw new GatewayError('EVENT_CAPACITY', 429);
    res.status(200).set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }).flushHeaders();
    res.write(': connected\n\n');
    const listener = (event: AuditEvent) => {
      // Slow consumers are disconnected, rather than accumulating unbounded incident buffers.
      if (!res.write(`event: audit\ndata: ${JSON.stringify(event)}\n\n`)) res.end();
    };
    options.audit.events.on('audit', listener);
    const heartbeat = setInterval(() => { if (!res.write(': heartbeat\n\n')) res.end(); }, 15_000);
    const expiry = setTimeout(() => res.end(), 5 * 60_000); // Reconnect revalidates JWT expiry.
    res.on('close', () => { clearInterval(heartbeat); clearTimeout(expiry); options.audit.events.off('audit', listener); });
  });
  app.post('/v1/chat/completions', async (req, res) => {
    const body = completionSchema.parse(req.body);
    const result = await options.gateway.run(identity(res), { messages: body.messages });
    if (['block', 'deny', 'require_approval'].includes(result.action)) {
      return res.status(result.action === 'require_approval' ? 409 : 403).json({
        error: { code: result.action, message: result.reason }, request_id: result.request_id, provider_calls: result.provider_calls,
      });
    }
    const id = `chatcmpl-${result.request_id}`;
    const created = Math.floor(Date.now() / 1000);
    res.setHeader('X-Aevia-Action', result.action);
    res.setHeader('X-Aevia-Request-Id', result.request_id);
    if (!body.stream) return res.json({ id, object: 'chat.completion', created, model: 'leakshield', choices: [{ index: 0, message: { role: 'assistant', content: result.answer }, finish_reason: 'stop' }] });
    // Compatibility streaming begins ONLY after the complete answer passes every output check.
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    const emit = (delta: Record<string, string>, finish_reason: string | null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: 'leakshield', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    emit({ role: 'assistant', content: result.answer }, null);
    emit({}, 'stop');
    res.end('data: [DONE]\n\n');
  });
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));
  const errors: ErrorRequestHandler = (error, req, res, _next) => {
    if (res.headersSent) { res.end(); return; }
    // Never serialize provider errors, Zod values, parser bodies or stack traces.
    if (error instanceof GatewayError) { res.status(error.status).json(req.path.startsWith('/api/') ? { error: error.code } : { error: { code: error.code } }); return; }
    const status = error instanceof z.ZodError || error?.type === 'entity.parse.failed' ? 400 : error?.type === 'entity.too.large' ? 413 : 500;
    const code = status === 400 ? 'INVALID_REQUEST' : status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR';
    res.status(status).json(req.path.startsWith('/api/') ? { error: code } : { error: { code } });
  };
  app.use(errors);
  return app;
}
