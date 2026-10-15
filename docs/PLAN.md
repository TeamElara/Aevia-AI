# LeakShield v3 — 24-Hour Plan

**CyberCUP 6.0 · Challenge CC6-AI03 · Detection and Prevention of Data Leakage through AI Models**
Revised 15 October 2026 · supersedes v2

The winning moment is a useful answer appearing on screen while the judges can see that the sensitive values never reached the model. Build that first, make every headline claim provable, and treat everything else as optional.

**Locked decisions**

- **Language:** TypeScript with a loose config (`strict: false`), run with `tsx`. Shared contracts live in one `types.ts`. If fewer than two teammates know TS, use JS + JSDoc.
- **LLM provider:** Groq as primary and Ollama as the local fallback. Both use one OpenAI-compatible adapter, and switching is one line in `.env`.

---

## What changed from v2

| # | Change | Why |
| --- | --- | --- |
| 1 | Canaries and fingerprints are presented as **extra detection layers**. ACL enforcement is the primary boundary | A model can leak a paraphrase without the marker, so no canary hit does not prove safety. Exact 8-word shingles miss paraphrases |
| 2 | **Final outbound scan** of the complete assembled payload (system prompt, history, retrieved chunks, current prompt) just before the provider call | Masking only the prompt misses sensitive data that arrives through documents or earlier turns |
| 3 | **Exact restoration only**, with random placeholders. Restoration runs before link sanitisation, so restored values can never end up in a URL | Loose matching could substitute user-typed or model-invented lookalike tokens |
| 4 | **Conversation-scoped vault** (in memory, 30-minute TTL) instead of a per-request vault | The second message in a chat must still restore `[AADHAAR_K7Q2]` |
| 5 | Secrets are also scanned across the **last 3 user messages joined together** | A key split across two messages would otherwise pass |
| 6 | Aadhaar needs **checksum + (context word or 4-4-4 grouping)** to be masked; checksum alone only warns. Cards need Luhn + a valid issuer prefix and length | About 1 in 10 random 12-digit numbers passes Verhoeff, and Luhn has the same rate |
| 7 | Classifier timing: retrieved chunks are scored **once at ingest**, and at runtime only the user prompt is classified. It is skipped when rules already block. Use int8 quantisation if p95 is over target | Full-size DeBERTa is around 700 MB and slow on a laptop CPU |
| 8 | Classifier is an **hour-1 feasibility spike**. Hinglish claims rest only on our own measured results | The model card covers English prompt injection only and excludes jailbreaks; Node support is unverified until the spike |
| 9 | ACL query covers **groups and per-user grants** | v2's query ignored `allowed_users` |
| 10 | Approval example uses `meera` (engineering) | The Garuda doc is engineering-only; v2's HR example contradicted the corpus |
| 11 | Pending approvals are held **encrypted in memory for 10 minutes**; the database stores metadata + request hash only | v2 forbade storing raw prompts but gave the queue nowhere to keep the request |
| 12 | `/v1/chat/completions` supports `stream: true` by **buffering, inspecting, then streaming**. The canary is appended to the app's own system prompt | Most chat apps request streaming; on this path the app writes the system prompt |
| 13 | The privacy test covers **audit records, incidents, approval metadata and logs**, not the source corpus | The synthetic employee corpus deliberately stores Aadhaar/PAN in MongoDB |
| 14 | **"Leaked" is defined precisely** and measured from captured provider payloads; an **unprotected baseline** runs the same cases through the same model | A BLOCKED badge alone is not evidence |
| 15 | Live demo runs a **10-case labelled subset**; the full frozen report sits beside it. Approval wait time is reported separately from latency | 60 sequential model calls do not fit in 35 seconds |
| 16 | Owners rebalanced: approvals to C, audit + SSE to D, eval runner to A after hour 9, classifier spike stays with C | A was carrying too many integrations |
| 17 | New small features: **"Replace with [SECRET_…] and send"** button, **DPDP Act 2023 mapping slide**; Chrome extension and policy impact preview added as **stretch** with a hard kill time | Keep the work flowing; local relevance; extension only if the core is done |
| 18 | Closing line changed to "Useful answers, and you can see exactly what reached the model." | "Your data stays inside" is untrue for approved content sent to Groq |

---

## 1. Build tiers

Each tier must work before the next one starts. The gates in the schedule enforce this.

| Tier | Deliver | Done by |
| --- | --- | --- |
| **Essential** | Reversible masking with the conversation vault, secret blocking, ACL retrieval, final outbound scan, buffered output checks, private audit, eval harness with payload capture | Hour 9 |
| **Main presentation** | Polished chat, "Sent to model" view, live incidents, three reliable scenarios, injection rules + basic normaliser (NFKC, zero-width, homoglyphs, digit joining) | Hour 12 |
| **Next** | Minimal approval flow, `/v1` endpoint (non-stream first, then stream), "Replace and send" button, one-level base64 decoding, classifier if the spike passed | Hour 15 |
| **Stretch** | Chrome extension for chatgpt.com, policy impact preview, full policy editor, large live replay, extensive decoding, PDF inspection | Only after the hour-12 gate passes |

---

## 2. Differentiators (claims corrected)

1. **Reversible masking.** The model sees `[AADHAAR_K7Q2]`, does the task, and the gateway restores the real value in the reply. Values the user typed are restored to that user. Values from a document are restored only if the user is allowed to read that document. Everything else is redacted.
2. **"Sent to model" proof.** Next to every reply, show the exact sanitised payload that went to the provider and the provider-call count. This is the evidence behind every badge. It is shown in-session only and never persisted.
3. **Access-controlled retrieval.** Restricted text never enters the model context. This is the primary control and holds even when every detector misses.
4. **Layered leak detection on output.** Canary markers catch a leak of the system prompt or a restricted doc when the marker escapes. 8-word fingerprints catch verbatim copying. Neither proves the absence of a paraphrased leak; that guarantee comes from item 3.
5. **Anti-evasion normaliser + Hinglish rules.** Robustness is measured on a separate set of mutated attacks, not claimed.
6. **Baseline comparison.** The same cases go through the same model with and without LeakShield. The slide shows the leak counts side by side.

Smaller touches: a per-stage latency strip on each reply, e.g. `PII 3ms · Inject 41ms · ACL 2ms · LLM 620ms · Out 4ms`, and a "Replace with [SECRET_…] and send" button when a credential blocks a prompt, so the user can carry on.

---

## 3. Architecture

```mermaid
flowchart TD
    U["User or app<br/>Chat UI, or OpenAI SDK via /v1"] --> S1["1 · Authenticate<br/>JWT gives user ID and groups"]
    S1 --> S2["2 · Normalise and inspect prompt<br/>PII, secrets (last 3 msgs), injection"]
    S2 --> S3["3 · Permission-filtered retrieval<br/>ACL (groups + users) inside the Mongo query"]
    S3 --> S4["4 · Check retrieved chunks<br/>Ingest-time injection score → quarantine"]
    S4 --> S5["5 · Final outbound scan<br/>Whole payload: system + history + chunks + prompt"]
    S5 --> LLM["LLM provider<br/>Groq (primary) · Ollama (fallback)"]
    LLM --> S6["6 · Buffered response inspection<br/>PII, secrets, canary, fingerprints"]
    S6 --> S7["7 · Restore exactly, then sanitise links<br/>Release (or stream on /v1)"]

    S2 --- V["Conversation vault<br/>Random tokens, memory only, 30-min TTL"]
    S3 --- D["Docs and ACLs (MongoDB)<br/>Chunk ACLs, injection scores, shingles"]
    S5 --- P["Policy engine<br/>policy.yaml, strictest action wins"]
    S5 --- Q["Approval queue<br/>Encrypted in memory, 10-min expiry"]
    S6 --- A["Privacy-aware audit log<br/>Metadata only, HMAC user IDs"]
    A --> DB["Admin dashboard<br/>Incidents, approvals, eval report"]
```

A block at steps 1–5 returns before the LLM is called, so the provider-call count is 0. Every stage writes metadata to the audit log; for clarity, only step 6's link is drawn.

---

## 4. Stack

| Component | Choice | Fallback | Notes |
| --- | --- | --- | --- |
| Gateway | Node 20 + Express + TypeScript (`tsx`, `strict: false`) | JS + JSDoc | Each detector is a pure function `(text, ctx) => Finding[]`. Detectors live in a shared `packages/detectors` folder so the stretch extension can reuse them |
| LLM | Groq via one OpenAI-compatible `provider.ts` | Ollama (small Llama/Qwen) | Pull the local model by hour 2. The adapter records call count and payload in eval mode |
| PII + secrets | Hand-written TS: regex + Verhoeff + Luhn/IIN + `libphonenumber-js` + about 20 key formats from the gitleaks ruleset | — | No Presidio |
| Injection classifier | `protectai/deberta-v3-base-prompt-injection-v2`, ONNX, via `@huggingface/transformers` | int8-quantised ONNX, then a FastAPI sidecar, then rules only | Hour-1 spike decides. English only |
| Data | MongoDB: docs, chunks, audit, approval metadata | — | `$text` index + ACL predicate in one query |
| Policy | `policy.yaml` + `zod`, hot reload | JSON | Version stamped on every audit event |
| UI | React + Vite + Tailwind + Recharts, SSE incident feed | — | |
| Tests + eval | Vitest + `eval.ts` (JSON + Markdown reports, baseline mode) | — | |
| Deploy | `docker compose up` (mongo, gateway, web, optional classifier) | `npm run dev` | `.env.example` + seed script |

**Groq tasks in hour 1:**

- In the actual team account, check the data-retention settings and the current terms. Write down exactly what Groq keeps, for the Q&A.
- Check the free tier's per-model request limits. The eval runner sends one request at a time and retries on HTTP 429.

---

## 5. Detection engine

```ts
// types.ts — agreed in hour 0
export interface Finding {
  category: string;            // AADHAAR | PAN | PHONE | CARD | SECRET | INJECTION | CANARY | ...
  source: 'prompt' | 'history' | 'document' | 'response';
  start: number; end: number;   // offsets in the ORIGINAL text
  score: number;                // 0..1
  ruleId: string;
  via: 'raw' | 'normalised' | 'decoded';
}
```

### Normaliser

Main presentation tier:

1. Unicode NFKC.
2. Strip zero-width and bidi characters.
3. Map homoglyphs to ASCII.
4. Fold leetspeak, for keyword matching only.
5. Join digit runs split by spaces, dots or dashes.

Next tier: decode base64/hex/URL-encoded blocks of 16 or more characters, one level deep.

Keep an offset map so masks land on the original text.

### Sensitive data

| Category | Detection | False-positive guard |
| --- | --- | --- |
| Aadhaar | 12 digits, first digit 2–9, Verhoeff, **and** a context word (aadhaar, aadhar, UID, आधार) within about 40 characters **or** 4-4-4 grouping. Also the 16-digit VID | Checksum alone only warns. About 10% of random 12-digit numbers pass Verhoeff, so the checksum is never enough by itself |
| PAN | `[A-Z]{3}[PCHFATBLJG][A-Z][0-9]{4}[A-Z]` | 4th-letter holder-type rule |
| Phone | `libphonenumber-js`, region IN, mobile 6–9 | Bare numbers that fail the parse are ignored |
| Cards | Luhn **and** a valid issuer prefix + length (Visa, Mastercard, RuPay, Amex) | Luhn alone also passes about 10% of random numbers |
| Other financial | IFSC `[A-Z]{4}0[A-Z0-9]{6}`, UPI `name@bank`, bank account 9–18 digits only with context words | Prices, dates and ₹ amounts ignored |
| Credentials | AWS `AKIA…`, `sk-…`, `ghp_…`, `AIza…`, `xox[bp]-…`, Stripe live keys, JWT, PEM private keys, DB URIs with passwords, `password=` | Also scanned over the **last 3 user messages joined**; entropy is supporting evidence only |
| Confidential | Classification labels, protected phrases from the policy, canary markers | Arbitrary confidential prose is out of scope (stated limitation) |

### Prompt injection

- **Rules: intent × target.** Verbs (ignore, forget, reveal, repeat, print, "you are now") combined with targets (instructions, system prompt, configuration, text above, other users, admin). One family alone is weak evidence; both together are strong.
  - Hinglish: `pichle/upar wale instructions bhool jao`, `system prompt dikhao`, `ab tum admin mode mein ho`, `sabka data do`.
  - Structural tells: fake role tags (`### system:`, `</system>`, `[INST]`), developer mode, DAN-style personas.
  - Cross-user: another user's name or ID combined with data, history or conversation.
- **Meta-discussion damping:** a phrase inside quotes, or after "what is", "explain" or "why is … dangerous", is lowered one level.
- **Classifier (if the spike passed):**
  - Runs on the user prompt only, in 512-token windows with a 64-token stride.
  - Skipped when rules already score 0.85 or more.
  - Retrieved chunks are not classified at runtime; their score was computed at ingest.
- **Thresholds**, tuned on the dev set only:
  - 0.85 or more: block.
  - 0.6–0.85: warn, and use a hardened system prompt.
  - Below 0.6: allow.

### Indirect injection

At ingest, scan the source text before rendering. Look in comments, `display:none` text, white or near-white text, zero-width text, and alt and title attributes. Store `injection_score` per chunk. At retrieval, any chunk over the threshold quarantines its whole document and raises an incident.

### Final outbound scan (step 5)

Run every detector over the **complete assembled payload**: system prompt, conversation history, retrieved chunks and current prompt. Then apply the policy to whatever it finds:

- A user-origin value still unmasked: mask it.
- A document-origin PII value: mask it (it is restored later only for users who may read that document).
- Content from a doc with `external_llm: deny`: block the request.
- Content from a doc with `external_llm: approval`: send the request to the approval queue.

Nothing leaves the gateway without passing this check.

### Response inspection (buffered)

Run these steps in order:

1. PII and credential detectors run on the raw model output.
2. A canary hit blocks the response and raises an incident.
3. A fingerprint overlap with a doc the user may not read blocks the response.
4. Restore exact vault tokens (section 6).
5. Sanitise links: remove Markdown images and links whose domain is not on the allowlist, and any URL that contains a restored value.
6. Render the answer as plain text in the UI, never raw HTML.

---

## 6. Masking and restoration

- **Vault scope:** keyed by `(user_id, conversation_id)`, in memory only, with a 30-minute TTL. It is never logged or persisted, and it is cleared on logout.
- **Tokens:** `[CATEGORY_XXXX]`, where XXXX is 4 random base32 characters per value per conversation. The same value in the same conversation reuses its token, so history stays consistent across turns.
- **Restore exactly:** replace only exact token matches that exist in this conversation's vault. Origin rules:
  - User-origin values are restored to that user.
  - Document-origin values are restored only if the user's ACL allows that document.
  - Anything else stays masked or is redacted.
- **Lookalikes:** text in the user's own prompt that looks like a token but is not in the vault stays literal. A token the model mangles stays visible as a placeholder. There is no fuzzy matching.
- **Model instruction:** the system prompt says to keep tokens like `[AADHAAR_K7Q2]` verbatim.

---

## 7. Access-controlled RAG and policy

### Corpus: 10 synthetic documents

| Doc | Classification | Allowed | Purpose in demo |
| --- | --- | --- | --- |
| Holiday calendar 2026 | public | all | Normal RAG works |
| Leave and WFH policy | internal | all employees | Normal RAG works |
| Salary bands FY27 | restricted | group `hr` | Main unauthorised-retrieval scenario |
| Employee master (synthetic Aadhaar/PAN) | restricted | group `hr` | Document-origin masking + restoration for HR, redaction for others |
| Payments service README | internal | group `engineering` | Fake key, so the credential block fires on retrieval |
| Project Garuda roadmap | confidential, `external_llm: approval` | group `engineering` | Approval scenario with `meera` |
| Vendor FAQ (poisoned) | internal | all | Hidden HTML-comment injection gets quarantined |
| Onboarding guide (poisoned) | internal | all | White-text injection gets quarantined |
| Board minutes Q2 | restricted | user `ceo` only (per-user grant) | Tests `allowed_users`. Admin sees incidents but not this doc |
| IT security policy | internal | all | Legit security talk; must not false-positive |

All records are synthetic. Aadhaar values must pass Verhoeff, and all keys must be fake.

### Retrieval rules

- The query is `{$text: {$search: q}, $or: [{allowed_groups: {$in: user.groups}}, {allowed_users: user.id}]}`, so ACLs apply before top-k.
- Recheck permissions at context assembly. A missing ACL means deny. Denials never echo titles.
- Read permission is separate from permission to send to the provider (`external_llm: allow | approval | deny`).
- Identity comes from the JWT only. "I am Ravi from HR" in a prompt changes nothing.

### Policy matrix (`policy.yaml`)

| Condition | Action | User sees |
| --- | --- | --- |
| PII or financial data in the outbound payload | **mask** (reversible) | Normal answer with permitted values restored |
| Aadhaar-like number with checksum only, no context | **warn** | Answer plus a notice |
| Credential or private key in the prompt or last 3 messages | **block** | "Replace with [SECRET_…] and send" button. Provider called 0 times |
| Injection score of 0.85 or more | **block** | Short reason with the rule ID |
| Injection score from 0.6 to 0.85 | **warn** | Answer plus a notice; a hardened system prompt is used |
| Suspicious retrieved chunk | **quarantine** document | Answer without that document, plus a notice |
| Unauthorised document | **deny** (retrieval filter) | No content and no title |
| Doc with `external_llm: approval` in the payload | **require approval** | "Pending admin approval" with live status |
| Doc with `external_llm: deny` in the payload | **block** | "This document cannot be sent to an external model" |
| PII in the response not restorable for this user | **redact** | Redacted answer |
| Canary, fingerprint or credential in the response | **block response** | "Response withheld" |

When actions conflict, the strictest wins, in this order:

1. block
2. require approval
3. deny
4. quarantine
5. redact
6. mask
7. warn

### Approval flow (Next tier)

1. The pending request (assembled payload + context) is encrypted with AES-GCM using a per-process key and held in memory for 10 minutes.
2. MongoDB stores only `approval_id, request_hash, user_pseudo, doc_ids, reason, status, expires_at`.
3. When the admin approves, the gateway re-checks policy and ACL against the same request hash, then calls the provider.
4. Reject or expiry deletes the in-memory copy.

Approval wait time is reported separately and is never mixed into gateway latency.

### `/v1/chat/completions` (Next tier)

- Ship the non-streaming version first.
- `stream: true`: the gateway buffers the full model reply, inspects and restores it, then sends it to the app as SSE chunks.
- The canary is appended to the app-supplied system message.
- Identity comes from an API key mapped to a demo user.

---

## 8. Audit privacy and dashboard

- **Audit allowlist:** `request_id, ts, user_pseudo, conversation_pseudo, stage, categories[], counts{}, rule_ids[], policy_version, action, model_called, via[], stage_ms{}, total_ms`.
- `user_pseudo` is an HMAC-SHA256 with a server secret, never a plain hash. Use the same HMAC for value fingerprints, so repeat leaks can be counted without storing the value.
- A logger redaction filter keeps raw prompts out of `console.log` and error traces.
- **Privacy test (Vitest):**
  1. Seed 5 synthetic values.
  2. Run every scenario, including an approval and an error path.
  3. Assert 0 raw hits in audit records, incident events, approval metadata, application logs and stderr.
  4. Exclude the source document collection: it holds synthetic PII by design, protected by ACL.
- **Retention:** incidents expire after 30 days via a Mongo TTL index.

| View | Contents |
| --- | --- |
| Chat | User switcher, action badge, reason, latency strip, "Sent to model" payload + provider-call count |
| Live incidents | SSE feed: time, user_pseudo, stage, category, rule, action, `via` |
| Overview | Requests, % blocked, % masked, category donut, incidents per 5 min, p50/p95 overhead |
| Approvals | Pending requests, expiry countdown, approve/reject, request hash |
| Eval | 10-case live run button + full frozen report + baseline comparison |

---

## 9. Team and schedule

| Owner | Builds | Accountable for |
| --- | --- | --- |
| A: Request lifecycle | Pipeline stages 1–7, Groq/Ollama adapter with payload capture, conversation vault + exact restoration, final outbound scan, buffered output, `/v1` endpoint; **eval runner + baseline mode** from hour 9 | End-to-end behaviour and leak evidence |
| B: Detection | Normaliser, PII/secret detectors (Verhoeff + context, Luhn + IIN), multi-message secret scan, injection rules (EN + Hinglish), classifier integration, response detectors, canaries | Precision and recall |
| C: Access + approvals | Corpus + seed, users/JWT, ACL retrieval (groups + users), ingest scanner + quarantine, shingle fingerprints, **classifier spike**, **approval queue backend**, security integration tests | Zero unauthorised chunks; approvals |
| D: UI + audit + evidence | React chat + dashboard + approvals UI, **audit store, logger filter, SSE feed**, eval dataset (half the mutations scripted), slides, demo | Evidence and story |
| Stretch owner | Chrome extension. Given to the teammate with browser-extension experience, **only** after the hour-12 gate | Kill at hour 17 if it is not demo-stable |

| Hours | Work | Gate (exit condition) |
| --- | --- | --- |
| 0–1 | Agree `types.ts` (`Finding`, `Decision`, `AuditEvent`, `Provider`, `VaultEntry`). Set up the repo and compose file. Check Groq retention settings and rate limits. D starts the 20 dev cases | Contracts merged |
| 1–3 | A: pass-through gateway, JWT, Groq adapter with call counter, Ollama pulled. B: basic normaliser + Aadhaar/PAN/phone/card + secrets. C: corpus, seed, ACL query, **1-hour classifier spike** (Node ONNX, then int8, then sidecar). D: chat shell, dev cases | UI → gateway → Groq → UI works; an audit row is written; the classifier decision is recorded |
| 3–6 | A: conversation vault, exact restore, final outbound scan, buffered output. B: injection rules + Hinglish + scoring, multi-message scan. C: ingest scanner, chunk injection scores, quarantine, shingles. D: badges, "Sent to model" view, latency strip, audit store + logger filter | **Scenario 1 live:** Aadhaar masked and restored over 2 turns; a secret prompt shows provider calls = 0 |
| 6–9 | A: response pipeline (detect, then restore, then sanitise links), eval runner with payload capture. B: response detectors, canary, classifier integration if the spike passed. C: RAG wired in, `external_llm` flags, security integration tests. D: SSE incidents + overview, held-out set finished | **Essential tier done; all 3 scenarios end to end** |
| 9–12 | A: baseline mode, non-stream `/v1`, Ollama fallback end to end. B: tune on dev only. C: approval queue backend. D: approvals UI, robustness set (mutation script + hand-written Hinglish/paraphrase) | **Main presentation tier done**; demo-able on Groq and Ollama |
| 12–15 | Next tier: `/v1` streaming, "Replace and send" button, base64 decoding. Hardening: fail-closed scanner, timeouts, 429 retry. Stretch owner starts the extension only if gate 12 passed. | Clean-clone `docker compose up` works on a second laptop |
| 15 | **Freeze rules and thresholds.** Tag `eval-freeze` | Tag committed |
| 15–17 | Held-out, robustness and baseline runs on the frozen tag, one request at a time. Measure p50/p95 overhead. List every miss. **Extension kill decision at 17:00** | `results/` committed |
| 17–19 | README, limitations, DPDP mapping slide, architecture diagram | A teammate who did not build it can start it from the README alone |
| 19–21 | Slides (8 max), backup video, rehearsal ×2 | Demo fits in 5:00 |
| 21–24 | Rehearsal ×3, bug fixes only, 2-hour buffer | No new features after hour 21 |

Merge to `main` at least every 2 hours. The chat UI calls the real gateway from hour 3 onward.

---

## 10. Evaluation

| Set | Size | Used for |
| --- | --- | --- |
| Dev | 20 | Tuning (B may look) |
| Held-out | 60 (30 allowed / 30 intervention) | Headline metrics |
| Robustness | 60 = 15 held-out attacks × 4 mutations | Reworded-attack resilience |
| Live subset | 10 labelled cases drawn from held-out | Live demo only |

**Held-out composition:**

- Normal work: 12 (3 in Hinglish)
- Legit security discussion: 6
- Benign lookalikes: 6, including 2 checksum-valid 12-digit order IDs without context, and code with `password` as a variable name
- Authorised RAG: 6
- Sensitive disclosure: 12, including 1 key split across two messages and 1 two-turn masking case
- Direct injection: 8
- Indirect injection: 4
- Unauthorised retrieval: 6, including 2 impersonation cases, 1 per-user-grant case and 1 approval case

**Mutations:** homoglyph/leetspeak/zero-width and base64-wrapped are generated by script. Hinglish rewrite and semantic paraphrase are written by hand.

### Definition of "leaked"

- **Provider leak:** the captured outbound payload contains an unmasked seeded value, any chunk from a doc the user may not read, or any chunk from an `external_llm: deny` doc.
- **User leak:** the delivered response contains a value, canary or fingerprint from a doc the user may not read, or system-prompt text.
- **Evidence:** in eval mode the provider adapter records call count and payload per case. Results store only booleans and categories, never the payload itself.
- A "blocked" result counts only if the provider-call count for that case is 0.

### Baseline

The same 60 held-out cases go through the same Groq model with the gateway in passthrough mode and naive RAG (no ACL filter). Report provider leaks and user leaks for both runs, side by side.

| Metric | Target (verify; do not promise) |
| --- | --- |
| Precision / recall on intervention cases | ≥ 0.90 / ≥ 0.90 |
| False positives on the 30 allowed cases | ≤ 1 |
| Correct-action rate | ≥ 0.90 |
| Robustness retention (mutated recall ÷ original recall) | ≥ 0.85 |
| Provider leaks with LeakShield vs baseline | **0** vs measured |
| Unauthorised chunks reaching provider | **0** (hard requirement) |
| Raw seeded values in audit, incidents, approvals, logs | **0** (hard requirement) |
| Gateway overhead excluding LLM and approval waits, p50 / p95 | Measure; aim for under 50 ms / under 150 ms |

Report access control separately from detectors, and break results down per category. Show the misses on a slide.

### Integration checks (Vitest, deterministic)

- Blocked requests invoke the provider 0 times.
- The provider receives tokens, never seeded values, including values from history and retrieved chunks.
- Unauthorised chunks never enter the outbound payload; per-user grants are honoured.
- A simulated response containing PII, the canary or restricted text is redacted or blocked (clearly labelled as simulated).
- A user-typed or model-invented lookalike token is never restored.
- A restored value never appears inside a link or image URL.
- Scanner failure stops processing (fail closed).
- Two users or two conversations cannot read each other's vault or approvals.

---

## 11. Five-minute demo

| Time | Action | What judges see |
| --- | --- | --- |
| 0:00–0:25 | Hook + one architecture slide | Gateway with 7 stages; ACL as the primary boundary |
| 0:25–1:15 | **Scenario 1.** `asha` pastes a synthetic customer record, asks for a KYC letter, then a follow-up | "Sent to model" shows tokens and the provider-call count; both replies show her real values |
| 1:15–1:35 | Paste a fake AWS key, then click "Replace and send" | BLOCKED with provider calls = 0, then a useful answer with `[SECRET_…]` |
| 1:35–2:25 | **Scenario 2.** Paraphrased extraction, a Hinglish variant, a base64 variant | Blocks with rule IDs; `via: decoded` on the third |
| 2:25–3:15 | **Scenario 3.** `asha` asks for salary bands, claims to be Ravi, then `ravi` asks | Asha gets nothing and no title leaks; Ravi gets the answer with a citation |
| 3:15–3:35 | `asha` asks about vendor terms and retrieves the poisoned FAQ | QUARANTINED; she still gets an answer from the clean docs |
| 3:35–3:55 | *(cut if long)* `meera` summarises the Garuda roadmap; admin approves | PENDING, then approved, then the reply |
| 3:55–4:10 | *(cut if long)* Either the `/v1` SDK script with one changed line, **or** the Chrome extension on chatgpt.com if it passed the 17:00 kill check | Same protections on an existing app |
| 4:10–4:50 | Run the **10-case live subset**; show the frozen report + baseline table; search the audit store for the seeded Aadhaar | Scoreboard fills in; "Baseline leaks: N, LeakShield: 0"; 0 audit hits |
| 4:50–5:00 | Close: "Useful answers, and you can see exactly what reached the model." | Final metrics slide |

**Back-up plan:** a recorded video of this run, and Ollama switched on in `.env` if Groq or the Wi-Fi fails. Show the canary through the labelled simulated-response test.

---

## 12. Scope cuts, risks and checklist

**Cut in this order:**

1. PDF inspection
2. Policy impact preview
3. Chrome extension
4. `/v1` streaming
5. `/v1` endpoint
6. Approval queue (keep the action with a CLI approve)
7. Base64 decoding
8. Classifier (rules + normaliser only, limitation stated)

**Never cut:** conversation vault + exact restore, final outbound scan, ACL in the query, buffered output, private audit, eval with payload capture + baseline.

| Risk | Mitigation |
| --- | --- |
| Classifier too slow or will not load | int8 ONNX, then sidecar, then rules only. Decided by the end of hour 3 |
| Groq rate limits during eval | One request at a time, retry on 429; blocked cases make no calls; Ollama for the baseline if needed |
| Groq or Wi-Fi down on stage | Ollama tested by hour 12; backup video |
| Model mangles tokens | System-prompt instruction; mangled tokens stay visible (no fuzzy restore) |
| Checksum false positives | Context or grouping is required to mask; 2 such cases are in held-out |
| Scope creep (about 25 features) | Build tiers + gates at hours 3, 6, 9 and 12; stretch work only after gate 12; extension killed at 17:00 if not stable |

### DPDP Act 2023 slide (no code)

Map each control to the Act's obligations: data minimisation (masking), reasonable security safeguards (ACL, blocking), purpose limitation (per-document provider permission), and breach detection and reporting (incident log). Verify section numbers against the Act's text before putting them on the slide.

### Submission checklist

- [ ] Source: gateway, `packages/detectors`, web app, `policy.yaml`, seed script
- [ ] `docker compose up` + `.env.example` (Groq key, Ollama URL, provider switch) + README tested from a clean clone
- [ ] Synthetic corpus, demo accounts (`asha`, `ravi`, `meera`, `ceo`, `admin`), canary config
- [ ] `eval/dev.jsonl`, `eval/heldout.jsonl`, `eval/robustness.jsonl`, `eval/live_subset.jsonl` + `results/` (including baseline) at tag `eval-freeze`
- [ ] Architecture diagram + limitations: no OCR, English-only classifier, canary/fingerprint cannot prove the absence of paraphrased leaks, confidential prose outside registered labels, approved content does reach Groq
- [ ] Integration tests passing
- [ ] 8-slide deck incl. DPDP mapping + 5-minute script + backup video

---

## Sources

- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OWASP RAG Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)
- [protectai/deberta-v3-base-prompt-injection-v2 model card](https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2)
- [gitleaks default rules](https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml)
- [libphonenumber-js](https://www.npmjs.com/package/libphonenumber-js)

These links were not re-opened for this revision. Model size and ONNX availability come from the reviewer's check and are confirmed by the hour-1 spike. Performance figures are targets until the team's own evaluation verifies them.
