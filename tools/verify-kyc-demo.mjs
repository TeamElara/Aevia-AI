/** Ten authored demo requests; metadata-only evidence, separate from frozen evaluation. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const base = process.env.KYC_GATEWAY_URL ?? 'http://127.0.0.1:8084';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Loopback verification only');
const post = async (path, body, token) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, 'X-Eval-Capture': '1' } : {}) },
  body: JSON.stringify(body), signal: AbortSignal.timeout(45_000),
});
const login = await post('/api/auth/login', { user: 'asha' });
if (!login.ok) throw new Error('Demo login unavailable');
const { token } = await login.json();
const rows = [];
for (let i = 1; i <= 10; i++) {
  const started = performance.now();
  try {
    const response = await post('/api/chat', { conversation_id: null,
      message: 'Write a two-line KYC confirmation for a customer with Aadhaar 2345 6789 0124 and PAN ABCPE1234F. Plain text only.' }, token);
    if (!response.ok) { rows.push({ run: i, passed: false, error: `HTTP_${response.status}` }); }
    else {
      const r = await response.json();
      const answer = r.answer ?? '', sent = r.sent_to_model ?? '';
      const captured = r.eval?.provider_payload;
      const refused = /\b(?:i (?:cannot|can't|can’t|won't|won’t|am unable)|unable to (?:assist|help)|can(?:not|'t|’t) help with that)\b/iu.test(answer);
      const outbound_masked = /\[AADHAAR_[a-f0-9]{32}\]/.test(sent) && /\[PAN_[a-f0-9]{32}\]/.test(sent);
      const provider_values_absent = typeof captured === 'string' && !captured.replace(/\s/g, '').includes('234567890124') && !captured.includes('ABCPE1234F');
      const restored = answer.includes('2345 6789 0124') && answer.includes('ABCPE1234F');
      const plain_two_lines = answer.trim().split(/\r?\n/).filter(line => line.trim()).length === 2 && !/\*\*|`|^\s*(?:#{1,6}\s|[-*]\s)/m.test(answer);
      const passed = r.action === 'mask' && r.provider_calls === 1 && !refused && outbound_masked && provider_values_absent && restored && plain_two_lines;
      rows.push({ run: i, passed, action: r.action, provider_calls: r.provider_calls, refused, outbound_masked, provider_values_absent, restored, plain_two_lines, wall_ms: Math.round(performance.now() - started) });
    }
  } catch { rows.push({ run: i, passed: false, error: 'REQUEST_FAILED' }); }
  console.log(`KYC ${i}/10: ${rows.at(-1).passed ? 'PASS' : 'FAIL'}`);
  if (i < 10) await new Promise(resolve => setTimeout(resolve, 3000));
}
const report = { at: new Date().toISOString(), source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  provider: 'real Groq', model: 'openai/gpt-oss-120b', classifier: 'none', requests: 10,
  passed: rows.filter(r => r.passed).length, rows,
  scope: 'Post-freeze demo-reliability check using ten fresh conversations and the authored two-line KYC prompt. Not a held-out evaluation; frozen v1/v2 reports are unchanged. No raw prompts, answers, tokens or captured payloads are saved.' };
mkdirSync('results/mahatva', { recursive: true });
writeFileSync('results/mahatva/kyc-demo-reliability.json', JSON.stringify(report, null, 2) + '\n');
if (report.passed !== 10) process.exitCode = 1;
