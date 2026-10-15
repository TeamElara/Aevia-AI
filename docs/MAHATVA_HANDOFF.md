# Mahatva gateway hand-off

Implemented against `docs/TEAM.md` and the existing `apps/web/src/api/contract.ts`. Gateway code stays under `apps/gateway`; root changes are shared setup/contracts. Teammate implementation folders are untouched.

## Ojaswi → gateway

Export `detectAll(text, ctx)` from `packages/detectors/src/index.ts`. The gateway dynamically imports it at startup. A missing module, thrown exception, timeout, malformed result, invalid span, or invalid category/rule ID stops the request. Restart after adding/replacing the module.

`ctx` includes `source`, `canaries`, `currentUser` and `knownUsers`, plus gateway request/user metadata. Results follow the existing detector contract, including offsets into the supplied text. Only metadata is returned to the console; original offsets remain internal.

The gateway hides **only exact opaque tokens already minted by the authenticated conversation vault**, using same-length spaces in the inspection view. It similarly excludes the generated marker from input-side PII checks. This prevents random nonce digits from looking like PII without exempting attacker-written lookalikes. Output-side canary checks remain active. The gateway-authored system message is exempt from injection scoring; client text is not.

Checksum-only Aadhaar (`score < 0.8`) warns in both directions. Strong Aadhaar and other PII are masked inbound and redacted outbound. Secrets/private keys always block. Registered confidential labels in documents are redacted; the document's external-provider flag still governs whether its contents may leave.

## Alwaz → gateway

Set `RETRIEVAL_MODULE` to a module exporting:

```ts
retrieve(user: User, query: string): Promise<Chunk[]>
restrictedOverlap(response: string, user: User): Promise<boolean>
```

Use the shared `Chunk` type: `text`, `doc_id`, `allowed_groups`, `allowed_users`, `classification`, `external_llm`, `injection_score`, optional `title`/`canary`. Apply group OR user ACLs inside the Mongo query, before ranking/limiting. The gateway checks both arrays again; a missing ACL or forbidden returned chunk fails closed without exposing its title.

Any suspicious chunk removes the whole document from context. PII from documents is irreversibly redacted and never enters the user vault. `external_llm: deny` withholds an external call. Local Ollama can process read-authorised content under the local-provider policy. Provider permission is checked before approval, so an approval never overrides a deny.

Set `APPROVALS_MODULE` to a module exporting an `approvals` object:

```ts
enqueue({ messages, chunks }, ctx): Promise<{ id: string; expires_at: string }>
verifyAndConsume(id, ctx): Promise<boolean>
```

`ctx` contains `user`, `requestId`, `conversationId`, `policyVersion`, `requestHash`. Queue storage, AES-GCM encryption, 10-minute expiry, admin approve/reject endpoints and metadata-only Mongo records remain Alwaz's work.

An approved request is resubmitted to `/api/chat` or `/chat` with the original message, conversation ID and `approval_id`. The gateway reruns retrieval, ACL, scans and policy, hashes the assembled content plus identity/ACL/provider state, and calls `verifyAndConsume`. It must atomically verify approval status, expiry, owner, conversation and identical hash, then consume once. The random per-attempt system canary is excluded from the hash; actual model context, current policy version and destination are bound. Do not call the provider directly from the approval endpoint. Never store raw replay payloads in Mongo or logs.

## Arihant → gateway

The existing console works without source changes: gateway port **8080**, `/api/health`, opt-in `/api/auth/login`, and `/api/chat` with `message`/nullable conversation ID. Chat replies include findings summaries, `rule_ids`, `citations`, `sent_to_model: string | null`, action and actual provider-call count. Responses blocked after a call use `block_response` on the console API. The lower-level `/chat` retains the internal `block` action and full numeric finding metadata for evaluation.

`/api/events` and `/events` both require an admin bearer token. Connect with streaming `fetch`, not query-string JWTs. Events contain only the audit allowlist. Slow consumers are disconnected; reconnect reauthenticates. The stream is rotated every five minutes.

`POST /v1/scan` accepts `{ text }`; it is advisory and performs no provider call. It never proves the final assembled request is safe. `/v1/chat/completions` supports non-stream and buffered SSE text chat using the stock SDK and the `leakshield` model alias. Tools, images, arbitrary model destinations and unsupported options are rejected explicitly.

For evaluation, set `EVAL_MODE=true` while bound to loopback, consume `captured_payload` from `/chat`, and store **only booleans/categories/timings** in reports. Provider-call counts include actual retry attempts. There is no public bypass switch; the baseline belongs in the offline eval runner.

Mahatva contributed `D-001`–`D-007` and `H-001`–`H-024` under `eval/contributions/mahatva/`. Merge those with the existing root sets while checking duplicate IDs. The held-out contribution has not been used to tune gateway policy or detectors. Do not expose it to Ojaswi before the team's freeze.

## Pending live checks

- Actual team Groq key/model, retention settings and request limits.
- Real Ollama installation, selected model pull and inference.
- Docker startup on a host with Docker installed.
- Alwaz's live RAG and approval implementations, then security/eval runs across the complete system.
- Arihant's baseline runner, frozen metrics and full demonstration recording.

Tests use fixtures for LLM generation. They verify enforcement and integration; they do not establish detector precision/recall or real-model leak resistance.
