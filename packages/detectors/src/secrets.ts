import type { Category, Detector, Finding, Hit } from './types';

interface SecretRule {
  id: string;
  re: RegExp;
  category?: Category;
  score?: number;
  /** Mark only this capture group instead of the whole match. */
  group?: number;
}

// Formats adapted from the gitleaks default ruleset, plus Indian-English/Hinglish password phrasing.
const RULES: SecretRule[] = [
  { id: 'secret.private_key', category: 'PRIVATE_KEY', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, score: 0.99 },
  { id: 'secret.aws_access_key', re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { id: 'secret.aws_secret_key', re: /aws.{0,20}(?:secret|key).{0,20}?['"\s:=]+([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi, group: 1 },
  { id: 'secret.anthropic', re: /\bsk-ant-[A-Za-z0-9_\-]{20,}/g },
  { id: 'secret.openai', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_\-]{20,}/g },
  { id: 'secret.groq', re: /\bgsk_[A-Za-z0-9]{40,}\b/g },
  { id: 'secret.github_token', re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: 'secret.github_pat', re: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
  { id: 'secret.gitlab_pat', re: /\bglpat-[A-Za-z0-9_\-]{20}\b/g },
  { id: 'secret.google_api_key', re: /\bAIza[0-9A-Za-z_\-]{35}\b/g },
  { id: 'secret.slack_token', re: /\bxox[baprs]-[0-9A-Za-z\-]{10,}\b/g },
  { id: 'secret.slack_webhook', re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g },
  { id: 'secret.stripe_live', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/g },
  // Test-mode keys still open the account's test data and settings.
  { id: 'secret.stripe_test', re: /\b(?:sk|rk)_test_[0-9a-zA-Z]{24,}\b/g, score: 0.9 },
  { id: 'secret.stripe_webhook', re: /\bwhsec_[0-9a-zA-Z]{24,}\b/g },
  { id: 'secret.slack_app_token', re: /\bxapp-\d-[A-Z0-9]{9,}-\d{6,}-[a-f0-9]{32,}\b/g },
  { id: 'secret.twilio', re: /\bSK[0-9a-fA-F]{32}\b/g },
  { id: 'secret.sendgrid', re: /\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b/g },
  { id: 'secret.huggingface', re: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { id: 'secret.npm', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'secret.azure_storage', re: /AccountKey=[A-Za-z0-9+/=]{40,}/g },
  // Service Bus / Event Hubs / IoT Hub connection strings, and SAS signatures in URLs.
  { id: 'secret.azure_shared_access_key', re: /SharedAccessKey=([A-Za-z0-9+/=]{30,})/g, group: 1 },
  { id: 'secret.azure_sas', re: /[?&]sig=([A-Za-z0-9%+/=]{30,})/g, group: 1, score: 0.9 },
  // SQL Server / ADO.NET / JDBC connection strings: "...;User ID=app;Password=…;"
  { id: 'secret.connection_string_password', re: /(?:^|[;?&\s"'])(?:Password|Pwd)=([^;&'"\s]{6,})/gi, group: 1, score: 0.9 },
  // GCP service-account JSON: the private_key_id (the PEM body is caught by secret.private_key).
  { id: 'secret.gcp_service_account', re: /"private_key_id"\s*:\s*"([a-f0-9]{40})"/g, group: 1 },
  { id: 'secret.jwt', re: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, score: 0.9 },
  { id: 'secret.db_uri', re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|rediss|amqps?|mssql|cockroachdb|clickhouse):\/\/[^\s:@/]+:([^\s@/]+)@[^\s]+/gi, group: 1 },
  // password = "..." / api_key: ...
  { id: 'secret.assignment', re: /\b(?:password|passwd|pwd|passcode|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*(['"]?)([^\s'"]{6,})\1/gi, group: 2, score: 0.85 },
  // "my password is X", "mera password hai X"
  { id: 'secret.password_phrase', re: /\b(?:password|passwd|pwd|pin)\s+(?:is|hai|h|tha)\s*:?\s*(['"]?)([^\s'"]{4,})\1/gi, group: 2, score: 0.85 },
];

const PLACEHOLDER_CHECKED = new Set(['secret.assignment', 'secret.password_phrase', 'secret.connection_string_password', 'secret.db_uri']);

const PLACEHOLDER_WORDS = new Set(['placeholder', 'dummy', 'example', 'sample', 'fake', 'changeme', 'redacted', 'todo', 'xxx', 'xxxx', 'notreal', 'replaceme', 'mock', 'stub', 'your']);

// Values that look like code identifiers or placeholders, not real secrets.
function looksLikePlaceholder(v: string): boolean {
  // identifier, member access or a call (the value may stop at a quote, leaving "input(" unclosed)
  if (/^[A-Za-z_$][\w$.]*(\(.*)?;?,?$/.test(v) && !/\d/.test(v)) return true;
  if (/^(x+|\*+|\.+|<.*>|\{.*\}|\$\{.*\}|changeme|password|your[_-]?\w*|example|dummy|test|null|undefined|none|true|false)$/i.test(v)) return true;
  if (/^process\.env|^os\.environ|^env\./i.test(v)) return true;
  // A placeholder word as one part of a hyphenated value: "test-key-placeholder" (H-045), "dummy-key-for-tests".
  if (v.split(/[-_.:/]+/).some((part) => PLACEHOLDER_WORDS.has(part.toLowerCase())) || /not[-_]?real|replace[-_]?me|change[-_]?me/i.test(v)) return true;
  return false;
}

export const secrets: Detector = (text) => {
  const hits: Hit[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      let start = m.index!;
      let end = start + m[0].length;
      if (rule.group !== undefined) {
        const value = m[rule.group];
        if (!value) continue;
        if (PLACEHOLDER_CHECKED.has(rule.id) && looksLikePlaceholder(value)) continue;
        const offset = m[0].lastIndexOf(value);
        start = m.index! + offset;
        end = start + value.length;
      }
      hits.push({ category: rule.category ?? 'SECRET', start, end, score: rule.score ?? 0.97, ruleId: rule.id });
    }
  }
  return hits;
};

/** Shannon entropy in bits per character. */
export function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const ENTROPY_CTX = /\b(?:api[_\s-]?key|key|token|secret|password|passwd|credential|credentials|auth|bearer|signature|private)\b/i;
const TOKEN = /(?<![A-Za-z0-9_\-+/=])[A-Za-z0-9_\-+/=]{24,200}(?![A-Za-z0-9_\-+/=])/g;

/**
 * Fallback for keys with no known format: a long random-looking token next to a key-ish word.
 * Skips hex (hashes, commit ids), UUIDs, base64 that decodes to text, file paths and identifier-like words.
 */
export const entropySecrets: Detector = (text) => {
  const hits: Hit[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const v = m[0].replace(/=+$/, '');
    if (v.length < 24 || /^[0-9a-f]+$/i.test(v) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) continue;
    const classes = [/[a-z]/, /[A-Z]/, /\d/].filter((r) => r.test(v)).length;
    if (classes < 3 || entropy(v) < 4.2) continue;
    if (/\//.test(v) && !/[+=]/.test(m[0])) continue; // a path, not a key
    if (/^[A-Za-z0-9+/]+$/.test(v) && decodesToText(v)) continue;
    if (looksLikePlaceholder(v)) continue;
    const start = m.index!;
    const end = start + m[0].length;
    if (!ENTROPY_CTX.test(text.slice(Math.max(0, start - 40), start))) continue;
    hits.push({ category: 'SECRET', start, end, score: 0.8, ruleId: 'secret.entropy.ctx' });
  }
  return hits;
};

function decodesToText(v: string): boolean {
  try {
    const bin = atob(v.length % 4 ? v + '='.repeat(4 - (v.length % 4)) : v);
    let printable = 0;
    for (const c of bin) if (c >= ' ' && c <= '~') printable++;
    return printable / bin.length > 0.9;
  } catch {
    return false;
  }
}

export interface SplitSecretFinding extends Finding {
  /** Indexes into the messages array that the secret spans. */
  messageIndexes: number[];
}

/**
 * Join the last 3 user messages and look for secrets that do not appear whole in any single message,
 * e.g. a key pasted in two halves. Offsets are into the joined string.
 */
export function detectSplitSecrets(messages: string[]): SplitSecretFinding[] {
  const recent = messages.slice(-3);
  const base = messages.length - recent.length;
  const bounds: number[] = [];
  let joined = '';
  for (const msg of recent) {
    bounds.push(joined.length);
    joined += msg;
  }
  const out: SplitSecretFinding[] = [];
  for (const hit of secrets(joined, { source: 'history' })) {
    const idx: number[] = [];
    for (let k = 0; k < recent.length; k++) {
      const s = bounds[k];
      const e = s + recent[k].length;
      if (hit.start < e && hit.end > s) idx.push(base + k);
    }
    if (idx.length > 1) out.push({ ...hit, ruleId: hit.ruleId + '.split', source: 'history', via: 'raw', messageIndexes: idx });
  }
  return out;
}
