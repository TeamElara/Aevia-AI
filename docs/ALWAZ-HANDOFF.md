# Alwaz handoff

## Entry points

`apps/gateway/src/retrieval/index.js`: `createRetriever(collection)` returns `retrieve(user, query, options)`. Trusted principals are `{id, groups, roles}` resolved by JWT and current server-side memberships. Chunk fields match PLAN §7: `allowed_groups`, `allowed_users`, `external_llm` (`allow|approval|deny`). Mongo `$text` and ACLs apply before top-k. No admin document bypass. `quarantineHighScores` promotes any newly scored chunk at or above 0.85 into whole-document quarantine before retrieval/assembly; its optional notification callback emits metadata for the gateway incident sink. The service forwards that event to its audit callback. Missing ACLs deny access.

`assembleChunks(collection, user, chunks, options)` reloads ACLs and verifies content hashes. Defaults permit only external `allow`; `approved:true` additionally permits `approval`, never `deny`. `external:false` is for internal inspection/local providers. Do not construct cloud payloads directly from internal retrieval results.

`ingest.js` scans raw sources before markup removal and quarantines the whole source for comments, hidden CSS, white/near-white text, zero-width characters and instruction markers, including alt/title. `ingestWithClassifier` optionally computes scores once per chunk and quarantines the whole document when any chunk meets threshold. Invalid scores and classifier failures throw before persistence. This heuristic is conservative and is not an HTML sanitizer or full detector normalizer. Encoded CSS, images and novel obfuscations remain limitations.

`seed/seed.js`: `seedDatabase(db, {fingerprintKey})` upserts the exact ten planned documents, five memberships, separate group/user indexes, text index and expiry index. Restricted/confidential chunks store keyed eight-word shingles. Reusing the seed command is intended for a dedicated demo database, since it resets those known fixture records. Never point it at production.

## Gateway integration

`createAccessService({db, inspectOutbound, inspectResponse, provider, fingerprints, audit})` requires the two real scanner callbacks and provider adapter. Use `createFingerprinter(FINGERPRINT_KEY)` with the same key as the seed script. `service.run(userId, {prompt, history, attached_doc, conversation_id})` reloads the principal from Mongo, enforces access, handles three-state provider permissions, calls the final scanner on the entire assembled message list and checks restricted fingerprints on the buffered reply. History contains earlier user turns only; the gateway remains responsible for its own complete vault/system/assistant history assembly and detector logic. For the full chat endpoint, integrate these retrieval/approval boundaries inside Mahatva's pipeline rather than replacing it with this narrow service.

`inspectOutbound(payload, ctx)` returns `{action:'allow'|'mask'|'warn'|'block', payload}`; the first three require an inspected payload. `inspectResponse(text,ctx)` returns `{action:'allow'|'redact'|'block_response', answer}`. Throwing fails closed. Tests inject a simulated provider and test-only exact replacements; no PII detector implementation is claimed. `audit` receives only request UUID, action and call count. The team audit/logger/incident implementations remain separate dependencies.

`registerAccessRoutes(app, service)` installs Express-compatible `/api/access/retrieve`, `/api/approvals`, approve/reject and original-user result endpoints. Install verified-JWT middleware first to set `req.user.id`; never populate identity from request bodies. Generic HTTP errors avoid echoing document titles or scanner payloads. The UI scaffold does not yet call these routes; its owner can wire them to the team gateway.

## Approval contract

`createApprovals({metadata,revalidate,replay})` exposes `enqueue(payload,ctx)`, `approve(id,actor,expectedHash?)`, `reject(id,actor)` and admin-only `list(actor)`. Payload and context are AES-256-GCM encrypted with per-process key, random IV and approval-ID AAD, retained for ten minutes. Mongo stores only UUID, SHA-256 request hash, status and timestamps. The hash is a hash of the exact JSON payload/context bytes; raw requests are never persisted there. Errors in persistence or revalidation prevent replay. Queue entries are synchronously consumed before awaits, so concurrent approvals cannot double-call the provider. Capacity is bounded to 1,000 requests of at most 1 MB each.

The service rechecks current original-user memberships, document hashes, quarantine and provider permission before replay, and sends through outbound scanning again. Admin receives only completion metadata. The answer is held briefly in memory and is available once to the original user and conversation. A process restart invalidates pending requests. Multi-process deployment requires routing to the queue owner; no durable distributed queue is claimed. Database changes after the last read remain a race; transactional/versioned integration is needed for stronger isolation. Approval wait time is excluded from access timing.

## Validation and remaining team dependencies

The latest tests use Vitest and real MongoDB, including 37 access fixtures. Results contain metadata only. Held-out and paraphrase files follow Arihant's schema and ID ranges; `eval/dev.jsonl` includes Alwaz's six rows and preserves the existing seven Arihant rows. Add Mahatva's seven dev rows later. Alwaz’s held-out and paraphrase rows are also appended to the shared root files alongside the latest team evaluator. No detector thresholds were tuned on these sets. They are development integration fixtures, not a frozen independent benchmark. Frozen baseline metrics cannot be produced until the actual gateway/provider and complete team datasets exist.

PLAN §10 also requires conversation-vault exact restoration, restoration-before-link sanitization, full PII/canary behavior and privacy across the team's audit/incident/log stores. Those modules are absent upstream, so those end-to-end checks remain integration dependencies rather than being marked passed. This branch tests provider-zero-call boundaries, unauthorized outbound exclusion, callback masking/history wiring, restricted-response blocking, scanner failure, and user/conversation approval isolation.

See CLASSIFIER-DECISION.md for measured Node/int8 evidence, GROQ-ACCOUNT-CHECK.md for verified public policy and the remaining account verification, and results/alwaz/RESULTS.md for current scope and timings.

Local verification: dependency installation, security tests and schema validation passed from a separate clean local Git clone. This is a same-machine clean-copy check, not the scheduled second-laptop rehearsal.
