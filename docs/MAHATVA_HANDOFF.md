# Mahatva gateway hand-off

The team branches are integrated with their authorship preserved. Canonical install/test commands use the root npm workspace and `package-lock.json`; legacy per-folder/pnpm locks are not used by CI.

## Detector boundary

`apps/gateway/src/detector-adapter.ts` loads Ojaswi's public helpers from `packages/detectors/src/index.ts`:

- Prompt, history, document and outbound inspection use `safeDetectAll`; `ok:false` stops processing. The gateway validates the returned schema/spans as well.
- Output uses `detectResponse` with planted canaries.
- Last-three-user-turn joins also use `detectSplitSecrets`; detected split keys stop before any provider call.
- Post-restoration link sanitisation uses `findLinks`, followed by the gateway's additional plain-text URL/markup controls.
- UI-facing findings contain exactly `category`, `source`, `via`, `ruleId`; offsets/scores remain internal. Existing detector rule IDs are preserved, including `pii.aadhaar.ctx`, and API examples match them.

Only exact opaque tokens minted by the current user's conversation vault are exempted from accidental numeric detection, using same-length inspection spaces. Attacker-written lookalikes remain scanned. The gateway-generated system marker is exempted only on input; output detection remains active. Trusted gateway instructions alone are exempt from injection scoring.

Checksum-only Aadhaar warns; strong PII masks; email/IFSC default to configurable warn; credentials block. Document-derived PII is irreversibly redacted, never added to the user's reversible vault. Confidential document labels are redacted while `external_llm` governs the entire document's disclosure.

## Access and approvals

Default sample settings:

```dotenv
RETRIEVAL_MODULE=apps/gateway/src/retrieval/index.js
APPROVALS_MODULE=apps/gateway/src/approvals/index.js
```

With Mongo running, `npm run seed` uses `MONGODB_URI`, `MONGODB_DB` (default `aevia`) and the same `FINGERPRINT_KEY` as the gateway. It upserts the ten known **synthetic demo fixtures**; never run it on production data. This wrapper avoids the standalone legacy seed CLI's different database default.

The access adapter uses `createRetriever`/`assembleChunks`, reloads current Mongo memberships, rechecks source hashes/ACLs, supports group and per-user grants, and checks forbidden output shingles. `attached_doc` selection is ACL-filtered; denied IDs expose no title; poisoned selected sources are quarantined. Prompt text never grants access. Existing seed JWTs and gateway JWTs are accepted only with current database membership enforcement.

`approval-bridge.ts` wraps Alwaz's AES-GCM queue. Admin approval creates a private one-use grant and re-enters the full gateway pipeline with the original encrypted request. Current identity, policy, retrieval, ACLs, source integrity, provider permissions, scans and canonical request hash are checked again. A disappearing/changed document or revoked membership causes denial before any provider call. Simultaneous decisions cannot replay twice.

Mongo approval rows contain metadata/hash only. Payloads and original input stay encrypted in queue memory for ten minutes. Admin responses contain metadata, never the answer. The original user polls `/api/access/results/:requestId?conversation_id=...`; a result is owner/conversation-bound and returned once. Rejection/expiry/revalidation failure yields a denial. Restart invalidates pending in-memory state.

## Console and evaluation

Gateway port is **8080**. Supported: `/api/health`, opt-in `/api/auth/login`, `/api/chat`, admin `/api/events`, `/api/stats`, `/api/approvals` and approval decisions/results. Incidents use header-authenticated streaming fetch, with recent-event replay. Statistics count final requests once and exclude LLM time from overhead. Approval polling is connected to the original chat; duplicate merge-added approval APIs/screens were resolved.

`/v1/chat/completions` accepts the `leakshield` alias or configured model, buffers before streaming, and returns `leakshield` metadata. A policy block returns HTTP 200 with a safe explanation and zero provider calls so the stock SDK can display it. Unsupported tools/images/options remain rejected. `demo/sdk-demo.mjs` defaults to the alias. Only explicit `DEMO_AUTH=true` with no configured real API keys enables its `ls_demo_asha` key.

`/v1/scan` accepts `{text, history}`, emits metadata audit and returns summaries, `masked_text` and a caller-owned temporary vault. Blocked scans return null text/vault. The gateway deletes that temporary vault after the response is constructed. It remains advisory: final assembled-payload inspection is mandatory on the actual gateway path.

`EVAL_MODE=1` or `true` enables `X-Eval-Capture: 1` only on loopback. The existing evaluator receives `eval.provider_calls` and `eval.provider_payload`, checks booleans, then discards the payload. It now forwards `attached_doc`. Baseline additionally requires a separate loopback process with `BASELINE_MODE=true` and synthetic fixtures; ordinary servers reject passthrough headers. Never commit captured payloads or confuse simulated generation with real inference results.

Shared files now contain **20 dev cases (D-001–D-020), 60 held-out cases (H-001–H-060), 60 robustness cases and 10 live-subset cases**. Mahatva's contribution copies remain under `eval/contributions/mahatva/`. The shared benchmark files were assembled and schema-validated; gateway detector tuning used dev cases only. Existing access-package tests exercise their authored access fixtures, including their own held-out/robustness copies, and are not independent frozen evaluation evidence.

## Classifier and remaining live checks

See `docs/CLASSIFIER-GATEWAY.md`. Optional `CLASSIFIER_BACKEND=node` loads pinned fp32 ONNX and classifies only new user input, skipping rule-blocked prompts. Default is `none`. Alwaz's recorded Mac fp32 p50/p95 were 10.44/11.97 ms on six authored development prompts. Int8 loaded but misclassified the recorded attacks, so it is not enabled. These are not Windows gateway or frozen accuracy measurements.

The real-Mongo integration privacy test uses Ojaswi's `seededValues()`/`findSeededLeaks()` across audit, incidents, approval metadata, logs and an error path. Source corpus data is excluded by design. LLM generation in integration tests is simulated. Still needed: actual Groq key/model/account settings, real Ollama/Windows classifier inference, Docker startup, and the team's frozen evaluation and demonstration recording. Default GitHub branch has been checked and is already `main`.

Alwaz separately recorded real local Ollama smoke/boundary evidence on macOS: `results/alwaz/OLLAMA-VERIFICATION.md`. That report preserves its fixture mismatches and scope; it does not establish Windows inference, browser E2E or frozen accuracy. Its reproducible `npm run verify:ollama` command requires the explicitly configured local model and replaces that metadata report.
