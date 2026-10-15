> Current continuation evidence: [ALWAZ-CONTINUATION.md](ALWAZ-CONTINUATION.md). Earlier snapshots below are historical.

# Full merged gateway status

Mahatva’s gateway has now landed and is merged here. `approvals/gateway.js` bridges the encrypted queue into its `ApprovalService`. It holds only an ephemeral, one-use replay grant while calling the original Gateway with the original user/conversation; the gateway recomputes and verifies policy, provider, payload and ACL hashes before a provider call. Admin decisions never return the requester’s answer to the admin. Original-user polling rechecks current document read access. API routes expose list/approve/reject and scoped result retrieval. Use `APPROVALS_MODULE=apps/gateway/src/approvals/gateway.js` with the provided retrieval module and seeded database.

Four additional full-gateway tests exercise actual Mongo, Ojaswi detectors, Mahatva’s vault/audit/policy/Express app, Alwaz retrieval, the approval bridge, and a real loopback HTTP provider fixture. They verify single replay/hash binding, revoked membership, rejection, stats, and five-value audit/approval privacy. `npm run demo:gateway` starts that merged application without a cloud key and labels its provider as simulated. The original isolated host below remains a diagnostic reference, not the production entry point. The merged production gateway already provides `/v1`, dashboard SSE/stats, policy reload and isolated baseline support.

Validation: 412 default tests plus 21 real-service integration tests pass (433 total). The root dev and held-out datasets now contain 20 and 60 cases after adding Mahatva’s contributions. Remaining external evidence: authenticated Groq settings, real-model calls, final frozen robustness/baseline/rehearsal. No global eval-freeze tag or independent headline metrics are claimed.

# Alwaz access and approvals integration

## Implemented boundaries

`retrieval/index.js` performs Mongo `$text` search with `allowed_groups` and `allowed_users` ACLs before top-k. There is no admin document bypass. `external_llm` supports `allow|approval|deny`. Assembly reloads ACLs and content hashes; the service refreshes memberships and verifies scanned content again immediately before the provider, then refreshes response-side permissions. Newly high-scoring chunks quarantine every sibling and emit metadata for the audit/incident sink. Database changes after the final check remain a race; transactional/versioned integration is needed for stronger isolation.

`ingest.js` scans sources before rendering and quarantines whole documents for suspicious comments, hidden CSS, white/near-white text, zero-width/bidi characters and attribute instructions. It is a conservative heuristic, not a complete HTML sanitizer or obfuscation detector. `ingestWithClassifier` is an optional ingest-only classifier hook. Runtime does not load the large model by default. `fingerprints.js` provides keyed eight-word shingles; they catch copying, not paraphrases.

`seedDatabase(db,{fingerprintKey})` upserts the planned ten documents, two poisoned sources, five memberships, separate ACL indexes, text index and metadata expiry. It resets those known demo fixtures, so use a dedicated demo database. Asha is employee, Ravi HR, Meera engineering, CEO has a direct board grant, admin has approval authority without document access.

## Integration and runtime

The latest detector PR #3 is merged through `main` at `7d1e305`; detector source is preserved. The optional Transformers peer range also accepts the v4 runtime already used by the classifier spike. `retrieval/integration/scanners.ts` uses that real detector contract. It scans the complete assembled payload and each message with source context, masks PII into the conversation vault, blocks credentials/injection, checks buffered responses, restores exact known tokens only when origins remain authorized, and removes unsafe links afterward. Unknown/lookalike tokens remain literal. Split secrets are checked over the last three user turns. The vault is memory-only, scoped to user + conversation, bounded and expires after thirty minutes.

`createAccessService` still accepts required outbound/response scanner and provider callbacks for integration into the team's gateway. The reference host now supplies the real scanners. A scanner failure stops processing. Secrets block before an approval can be queued. Optional provider capture is memory/in-session only; the HTTP host exposes it only in explicit eval mode with the capture header. Reports retain booleans and timing metadata, never payloads.

`integration/http.ts` exposes health, explicit demo login, chat, admin approve/reject/list, and original-user/conversation result polling. It requires a strong JWT secret and explicit provider callback. Passwordless login is disabled unless explicitly enabled. Audit/incident sinks persist only UUID, action, call count and timestamp; log callbacks receive only metadata. This is a reference integration host, not a replacement for Mahatva's production API/policy/audit ownership. API-key mapping, `/v1`, streaming, policy hot reload, real Groq/Ollama transport and eval passthrough are outside this host.

`pnpm demo:access` starts temporary real Mongo, generates ephemeral keys, seeds fixtures, and binds to 127.0.0.1:8080 with an explicitly simulated echo provider. `apps/web` connects over the existing Vite proxy and labels this provider as simulated. The approvals view shows metadata/countdown, approves/rejects as admin and returns results to the requester’s chat in another tab. Tokens and chat text stay in browser memory; no localStorage is used. The team’s own ApprovalsView is retained and decisions submit the listed request hash. The local browser approval gate denied visual inspection, so UI verification consists of TypeScript/production build, ESLint and the tested HTTP contract. No visual/browser E2E pass is claimed.

## Approval invariants

Pending requests use AES-256-GCM with per-process key, unique IV and approval-ID AAD. They expire after ten minutes; Mongo receives ID, SHA-256 request hash, state and timestamps only. Requests are consumed synchronously before awaits to prevent replay duplication. Queue capacity is 1,000 entries, each at most 1 MB. Admin UI decisions submit the listed request hash. Policy, current memberships, quarantine, provider flags and content hashes are checked again before replay. Provider responses go only to the original user/conversation, once. `replaying` is visible as pending until the result is ready; expired/failed/rejected requests do not replay. A restart invalidates the in-memory queue. Multiple workers require routing to the owning worker or a redesigned encrypted shared queue.

## Evidence and external dependencies

The combined suite has 412 default tests, including the latest detector regression, benign-corpus and real-gateway privacy tests, plus 21 real-service integration tests. All eight PLAN §10 integration boundaries are represented using the actual detector package and simulated provider responses. Five seeded values have zero hits across the integration audit, incidents, approval metadata and captured logs. Four full-gateway bridge checks also validate the actual audit and approval stores with a simulated upstream.

All 37 access fixtures pass through real HTTP, JWT, Mongo, actual detectors and the scoped vault. These are unfrozen development fixtures, not independent headline accuracy or baseline metrics. Mahatva’s contributions are now merged into the root datasets; the team’s complete robustness and live-subset files have also arrived. A coordinated freeze and real-model evaluation are still needed. Arihant’s Hinglish and Alwaz’s paraphrase cases have distinct ID ranges. No detector tuning or global eval-freeze tag was performed. The local clean-copy check is not a second-laptop rehearsal.

Groq console access was rejected by the browser approval gate. Public documentation was checked, but organization/model limits and ZDR settings remain unverified. No passwords, tokens or keys are committed. A real Groq/Ollama comparison, frozen full-team results and final real-model video remain dependent on those external inputs.

## Real local-model follow-up

Real local Ollama verification is now recorded in `results/alwaz/OLLAMA-VERIFICATION.md` and `ollama-verification.json`: 38 direct-pipeline requests, 37 real model calls and 10/10 explicit smoke/boundary checks. All restricted/quarantined targets were excluded in the 16-case and 15-paraphrase slices. Original action labels matched only 4/31 cases; attached-document versus query retrieval, local versus cloud permissions and redact versus mask differ. This is development boundary evidence, not a passing full-fixture accuracy claim. Earlier statements that all real-model inference was unverified are superseded for this local run only; Groq remains unverified.

The shared evaluator now excludes both `llm` and `LLM` stage names from overhead; two focused regression tests pass. The previous deck and timing reports remain historical snapshots.
