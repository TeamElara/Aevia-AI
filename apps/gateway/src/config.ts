import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  JWT_SECRET: z.string().min(32), AUDIT_HMAC_SECRET: z.string().min(32),
  MONGODB_URI: z.string().startsWith('mongodb://').default('mongodb://127.0.0.1:27017'),
  MONGODB_DB: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/).default('aevia'),
  LLM_PROVIDER: z.enum(['groq', 'ollama']).default('groq'),
  GROQ_API_KEY: z.string().optional(), GROQ_MODEL: z.string().optional(),
  OLLAMA_URL: z.url().default('http://127.0.0.1:11434/v1'), OLLAMA_MODEL: z.string().optional(),
  POLICY_PATH: z.string().default('apps/gateway/policy.yaml'),
  DETECTOR_MODULE: z.string().default('packages/detectors/src/index.ts'),
  RETRIEVAL_MODULE: z.string().optional(), APPROVALS_MODULE: z.string().optional(),
  EVAL_MODE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
  API_KEYS_JSON: z.string().default('[]'),
});
export function loadConfig() {
  const env = envSchema.parse(process.env);
  if (env.JWT_SECRET === env.AUDIT_HMAC_SECRET) throw new Error('independent secrets required');
  if (env.EVAL_MODE && env.HOST !== '127.0.0.1') throw new Error('evaluation capture is loopback-only');
  if (env.LLM_PROVIDER === 'groq' && (!env.GROQ_API_KEY || !env.GROQ_MODEL)) throw new Error('Groq key and model required');
  if (env.LLM_PROVIDER === 'ollama' && !env.OLLAMA_MODEL) throw new Error('Ollama model required');
  const apiKeys = z.array(z.object({ key: z.string().min(32), user: z.object({ id: z.string().min(1).max(100), groups: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,39}$/)).max(20) }).strict() }).strict()).max(100).parse(JSON.parse(env.API_KEYS_JSON));
  return { ...env, apiKeys };
}
