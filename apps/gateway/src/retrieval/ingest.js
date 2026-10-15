import { createHash } from 'node:crypto';

// Conservative quarantine: suspicious source stays out of retrieval entirely.
export function scanIngest(source) {
  if (typeof source !== 'string') throw new TypeError('Document must be text');
  const reasons = [];
  const rules = [
    ['html_comment', /<!--[\s\S]*?-->/i],
    ['hidden_css', /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$))/i],
    ['near_white_text', /color\s*:\s*#(?:(?:e[b-f]|f[0-9a-f]){3}|[ef]{3})\b/i],
    ['white_text', /(?:color\s*:\s*(?:white|#fff(?:fff)?\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)))/i],
    ['zero_width', /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u],
    ['instruction', /(?:ignore|disregard|override)[\s\S]{0,70}(?:instructions?|rules?|policy)|(?:reveal|exfiltrate|send|print)[\s\S]{0,70}(?:secrets?|passwords?|system prompt|other users?)/i],
    ['role_spoof', /(?:<\|(?:system|assistant)|\[INST\]|^\s*system\s*:)/im],
  ];
  for (const [reason, rule] of rules) if (rule.test(source.normalize('NFKC'))) reasons.push(reason);
  // Attributes are scanned in the raw source, before stripping markup.
  for (const m of source.matchAll(/\b(?:alt|title)\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    if (rules.some(([,rule]) => rule.test(m[2]))) reasons.push('attribute_instruction');
  }
  return { injection_score: reasons.length ? 1 : 0, quarantined: reasons.length > 0, reasons: [...new Set(reasons)] };
}

export function ingestDocument(doc, { chunkSize = 1200 } = {}) {
  if (!doc?.id || typeof doc.text !== 'string' || !Number.isInteger(chunkSize) || chunkSize < 1) throw new TypeError('Invalid document');
  if (!Array.isArray(doc.allowed_groups) || !Array.isArray(doc.allowed_users) || !['allow', 'approval', 'deny'].includes(doc.external_llm)) throw new TypeError('Explicit ACL and external_llm required');
  const scan = scanIngest(doc.text);
  const chunks = [];
  for (let start = 0; start < doc.text.length; start += chunkSize) {
    const text = doc.text.slice(start, start + chunkSize);
    chunks.push({ _id: `${doc.id}:${chunks.length}`, document_id: doc.id, title: doc.title, text,
      allowed_groups: [...doc.allowed_groups], allowed_users: [...doc.allowed_users], classification: doc.classification, external_llm: doc.external_llm,
      content_hash: createHash('sha256').update(text).digest('hex'), ...scan });
  }
  return chunks;
}

/** Optional classifier runs once per chunk at ingestion, never on retrieved chunks at request time. */
export async function ingestWithClassifier(doc, classify, { threshold = 0.85, chunkSize = 1200 } = {}) {
  if (typeof classify !== 'function' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new TypeError('Classifier and threshold required');
  const chunks = ingestDocument(doc, { chunkSize });
  for (const chunk of chunks) {
    const score = await classify(chunk.text); // Throwing prevents the caller from persisting partial output.
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('Classifier returned invalid score');
    chunk.injection_score = Math.max(chunk.injection_score, score);
  }
  if (chunks.some(c => c.injection_score >= threshold)) for (const chunk of chunks) {
    chunk.quarantined = true;
    chunk.reasons = [...new Set([...chunk.reasons, 'classifier_document_quarantine'])];
  }
  return chunks;
}
