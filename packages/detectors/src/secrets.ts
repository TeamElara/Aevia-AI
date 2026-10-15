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
  { id: 'secret.twilio', re: /\bSK[0-9a-fA-F]{32}\b/g },
  { id: 'secret.sendgrid', re: /\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b/g },
  { id: 'secret.huggingface', re: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { id: 'secret.npm', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'secret.azure_storage', re: /AccountKey=[A-Za-z0-9+/=]{40,}/g },
  { id: 'secret.jwt', re: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, score: 0.9 },
  { id: 'secret.db_uri', re: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|mssql):\/\/[^\s:@/]+:([^\s@/]+)@[^\s]+/gi, group: 1 },
  // password = "..." / api_key: ...
  { id: 'secret.assignment', re: /\b(?:password|passwd|pwd|passcode|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*(['"]?)([^\s'"]{6,})\1/gi, group: 2, score: 0.85 },
  // "my password is X", "mera password hai X"
  { id: 'secret.password_phrase', re: /\b(?:password|passwd|pwd|pin)\s+(?:is|hai|h|tha)\s*:?\s*(['"]?)([^\s'"]{4,})\1/gi, group: 2, score: 0.85 },
];

// Values that look like code identifiers or placeholders, not real secrets.
function looksLikePlaceholder(v: string): boolean {
  // identifier, member access or a call (the value may stop at a quote, leaving "input(" unclosed)
  if (/^[A-Za-z_$][\w$.]*(\(.*)?;?,?$/.test(v) && !/\d/.test(v)) return true;
  if (/^(x+|\*+|\.+|<.*>|\{.*\}|\$\{.*\}|changeme|password|your[_-]?\w*|example|dummy|test|null|undefined|none|true|false)$/i.test(v)) return true;
  if (/^process\.env|^os\.environ|^env\./i.test(v)) return true;
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
        if ((rule.id === 'secret.assignment' || rule.id === 'secret.password_phrase') && looksLikePlaceholder(value)) continue;
        const offset = m[0].lastIndexOf(value);
        start = m.index! + offset;
        end = start + value.length;
      }
      hits.push({ category: rule.category ?? 'SECRET', start, end, score: rule.score ?? 0.97, ruleId: rule.id });
    }
  }
  return hits;
};

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
