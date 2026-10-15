# Mahatva gateway hand-off

Implemented against `docs/TEAM.md` and the existing `apps/web/src/api/contract.ts`. Gateway code stays under `apps/gateway`; root changes are shared setup/contracts. The two web API files have a minimal integration change for header-authenticated incident streaming and policy-version typing; components/design and detector/access implementations are untouched.

## Ojaswi → gateway

Export `detectAll(text, ctx)` from `packages/detectors/src/index.ts`. The gateway dynamically imports it at startup. A missing module, thrown exception, timeout, malformed result, invalid span, or invalid category/rule ID stops the request. Restart after adding/replacing the module.

`ctx` includes `source`, `canaries`, `currentUser` and `knownUsers`, plus gateway request/user metadata. Results follow the existing detector contract, including offsets into the supplied text. Only metadata is returned to the console; original offsets remain internal.

The gateway hides **only exact opaque tokens already minted by the authenticated conversation vault**, using same-length spaces in the inspection view. It similarly excludes the generated marker from input-side PII checks. This prevents random nonce digits from looking like PII without exempting attacker-written lookalikes. Output-side canary checks remain active. The gateway-authored system message is exempt from injection scoring; client text is not.

Checksum-only Aadhaar (`score < 0.8`) warns in both directions. Strong Aadhaar and other PII are masked inbound and redacted outbound. Secrets/private keys always block. Registered confidential labels in documents are redacted; the document's external-provider flag still governs whether its contents may leave.

## Alwaz → gateway

Your published `createRetriever`/`assembleChunks` API is now supported directly through `apps/gateway/src/access-adapter.ts`. Set `RETRIEVAL_MODULE=apps/gateway/src/retrieval/index.js` and `FINGERPRINT_KEY` to the seed key, and seed the configured `MONGODB_DB` (default `aevia`, while your standalone seed CLI currently defaults to `leakshield`). The adapter reloads users from Mongo, requests internal read-authorised chunks, rechecks their content hashes/ACLs, maps `document_id` to `doc_id`, and checks forbidden response shingles. JWTs from either the gateway issuer or `leakshield-seed` are supported when the database principal resolver is active. Token groups cannot override current Mongo memberships.

A standalone module can alternatively export:

```ts
retrieve(user: User, query: string): Promise<Chunk[]>
restrictedOverlap(response: string, user: User): Promise<boolean>
```

Use the shared `Chunk` type: `text`, `doc_id`, `allowed_groups`, `allowed_users`, `classification`, `external_llm`, `injection_score`, optional `title`/`canary`. Apply group OR user ACLs inside the Mongo query, before ranking/limiting. The gateway checks both arrays again; a missing ACL or forbidden returned chunk fails closed without exposing its title.

Any suspicious chunk removes the whole document from context. PII from documents is irreversibly redacted and never enters the user vault. `external_llm: deny` withholds an external call. Local Ollama can process read-authorised content under the local-provider policy. Provider permission is checked before approval, so an approval never overrides a deny.

The queue factory on your branch has a different replay interface from the gateway's minimal approval port. **Do not set `APPROVALS_MODULE` directly to your factory file yet.** A bridge must inject `revalidate`/`replay` callbacks that re-enter the full gateway pipeline, provide the ephemeral one-use grant consumed by `verifyAndConsume`, and register authenticated approve/reject/result routes. Until that bridge exists, requests correctly remain `require_approval` with zero provider calls.

The gateway's standalone adapter port expects an `approvals` object:

```ts
enqueue({ messages, chunks }, ctx): Promise<{ id: string; expires_at: string }>
verifyAndConsume(id, ctx): Promise<boolean>
```

`ctx` contains `user`, `requestId`, `conversationId`, `policyVersion`, `requestHash`. Queue storage, AES-GCM encryption, 10-minute expiry, admin approve/reject endpoints and metadata-only Mongo records remain Alwaz's work.

An approved request is resubmitted to `/api/chat` or `/chat` with the original message, conversation ID and `approval_id`. The gateway reruns retrieval, ACL, scans and policy, hashes the assembled content plus identity/ACL/provider state, and calls `verifyAndConsume`. It must atomically verify approval status, expiry, owner, conversation and identical hash, then consume once. The random per-attempt system canary is excluded from the hash; actual model context, current policy version and destination are bound. Do not call the provider directly from the approval endpoint. Never store raw replay payloads in Mongo or logs.

## Arihant → gateway

The existing console chat contract is supported: gateway port **8080**, `/api/health`, opt-in `/api/auth/login`, and `/api/chat` with `message`/nullable conversation ID. Chat replies include findings summaries, `rule_ids`, `citations`, `sent_to_model: string | null`, action and actual provider-call count. Responses blocked after a call use `block_response` on the console API. The lower-level `/chat` retains the internal `block` action and full numeric finding metadata for evaluation.

`/api/events` and `/events` both require an admin bearer token. Connect with streaming `fetch`, not query-string JWTs. Events contain only the audit allowlist. Slow consumers are disconnected; reconnect reauthenticates. The stream is rotated every five minutes.

The web client now uses that header-authenticated stream, and the server replays the last 50 metadata events before live events, without an initial-subscription gap. `/api/stats` counts final request records once rather than counting every pipeline stage. Its overhead subtracts LLM time, and it includes empty five-minute buckets. Approval dashboard routes remain part of the approval bridge dependency above.

`POST /v1/scan` accepts `{ text }`; it is advisory and performs no provider call. It never proves the final assembled request is safe. `/v1/chat/completions` supports non-stream and buffered SSE text chat using the stock SDK and the `leakshield` model alias. Tools, images, arbitrary model destinations and unsupported options are rejected explicitly.

For evaluation, set `EVAL_MODE=true` or `1` while bound to loopback. `/api/chat` honors `X-Eval-Capture: 1` with the `eval.provider_calls`/`eval.provider_payload` object already used by your runner; `/chat` also exposes `captured_payload`. Store **only booleans/categories/timings**. API stage names include uppercase `LLM`, so the existing overhead calculation excludes model time correctly. Provider-call counts include actual retry attempts.

For your runner's `--baseline`, use a **separate local process** with `BASELINE_MODE=true`, `EVAL_MODE=1` and synthetic seeded data. Only then does `X-LeakShield-Mode: passthrough` run naive Mongo text retrieval without ACLs, masking, quarantine or output checks. This mode is impossible on a public bind address or in the Compose service. Normal servers reject the header instead of silently returning protected results and misleading the comparison. Baseline histories are AES-GCM encrypted in memory and never logged. Full pipeline/runner integration is tested on dev fixtures with a simulated model; no frozen metrics are claimed.

Mahatva contributed `D-001`–`D-007` and `H-001`–`H-024` under `eval/contributions/mahatva/`. Merge those with the existing root sets while checking duplicate IDs. The held-out contribution has not been used to tune gateway policy or detectors. Do not expose it to Ojaswi before the team's freeze.

## Pending live checks

- Actual team Groq key/model, retention settings and request limits.
- Real Ollama installation, selected model pull and inference.
- Docker startup on a host with Docker installed.
- Alwaz's live RAG and approval implementations, then security/eval runs across the complete system.
- Arihant's baseline runner, frozen metrics and full demonstration recording.

Tests use fixtures for LLM generation. They verify enforcement and integration; they do not establish detector precision/recall or real-model leak resistance.
