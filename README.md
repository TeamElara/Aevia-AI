# Aevia AI / LeakShield

CyberCUP 6.0 · CC6-AI03 · an inspection gateway between workplace applications and an LLM.

This branch integrates Mahatva's request lifecycle, Ojaswi's detectors and Alwaz's access/approval modules. It builds on Arihant's console, with a small HTTP-client change for header-authenticated incidents and flexible policy-version types. Ojaswi owns production detection; Alwaz owns document retrieval, seeded data and approval storage. See [team assignments](docs/TEAM.md), [plan](docs/PLAN.md), [console API](docs/API.md) and [gateway hand-off](docs/MAHATVA_HANDOFF.md).

## What works

- JWT/API-key identity; opt-in passwordless login for the five synthetic demo accounts.
- YAML policy validation and reload, with version checks and fail-closed invalid changes.
- Exact random pseudonyms in a memory-only conversation vault, isolated by owner and conversation, with a 30-minute TTL.
- Input/history inspection, last-three-user-message secret checks, ACL rechecks on retrieved chunks, whole-document quarantine and final assembled-payload inspection.
- One buffered HTTP adapter for Groq and local Ollama, with attempt counters, bounded 429 retries, response-size limits and a shared timeout budget.
- Buffered output inspection, canary detection, optional restricted-overlap checking, exact restoration, then link/image sanitisation.
- Metadata-only Mongo audit records, HMAC identities, a 30-day TTL index and authenticated SSE incidents.
- Console chat APIs, advisory `/v1/scan`, and text-only `/v1/chat/completions`, including **buffered** SSE compatibility.

No detector module means `/ready` returns 503 and chat requests fail closed. No retrieval module means prompt-only operation, with no document access. No approval backend means approval-required content is withheld. These states are deliberate; they are not completed detection/RAG/approval features.

## Local setup

Use Node **24 LTS** (also supported: Node 22.12+ or 26+), npm, and MongoDB. Run commands from the repository root.

```sh
npm ci
npm run setup:env
```

Edit the generated `.env` locally:

1. For Groq, set `GROQ_API_KEY` and an available `GROQ_MODEL` from the team's account. For local inference, set `LLM_PROVIDER=ollama` and `OLLAMA_MODEL` to a model already pulled on that machine. The gateway never silently falls back to another destination.
2. Set `MONGODB_URI` for your MongoDB instance; the default is local Mongo on port 27017.
3. Ensure Ojaswi's detector implementation is present at `packages/detectors/src/index.ts`, or set `DETECTOR_MODULE` to its module path. It must export `detectAll(text, ctx)`.
4. For the **local synthetic demo only**, set `DEMO_AUTH=true` to enable the console's user switcher. This endpoint issues privileged demo identities without passwords; keep it disabled outside an isolated demo.
5. For Alwaz's published retrieval factory, set `RETRIEVAL_MODULE=apps/gateway/src/retrieval/index.js` after his branch is merged, and seed the **same Mongo database** with the same `FINGERPRINT_KEY`. The adapter maps his chunks, rechecks hashes/ACLs, reloads user memberships and checks restricted-output fingerprints. A standalone `retrieve`/`restrictedOverlap` module is also supported. Set `APPROVALS_MODULE=apps/gateway/src/approvals/gateway.js` for the encrypted queue bridge. It replays through the same gateway and validates the request hash, current access and policy.

```sh
npm run dev
```

The gateway listens on `http://127.0.0.1:8080`, matching the console's existing proxy. In a second terminal:

```sh
npm run dev --workspace @leakshield/web
```

Open `http://localhost:5173`. Set the web app's `VITE_API_MODE=live` for rehearsals so a missing gateway cannot be mistaken for a real result. The UI's mock mode is a separate frontend feature, not evidence of gateway operation.

For JWT-only use, leave demo login disabled and run `npm run token -- asha`. Tokens expire after one hour and exist only in terminal/session memory. API keys are mapped to identities through `API_KEYS_JSON`; prompts never grant permissions.

## Container setup

After configuring `.env` and merging the teammate modules:

```sh
docker compose up --build
```

Mongo and the gateway bind to loopback on the host. The gateway runs as the unprivileged `node` user. Container evaluation capture is disabled. Ollama can run separately on the host and is accessed through `host.docker.internal`; pull the selected model there first. The console currently runs using its existing Vite command above; a web production image belongs to its owner.

Docker and Ollama were not installed on the development host used for this implementation, so container startup and real local-model inference are **not yet verified**. The Compose file is validated structurally in the repository checks. Never describe simulated integration tests as real model measurements.

## API

- `GET /api/health`, `GET /health`: liveness.
- `GET /ready`: scanner/policy readiness at startup; audit failures independently stop requests.
- `POST /api/auth/login`: opt-in synthetic demo login.
- `POST /api/chat`: existing console contract, with `message` and nullable `conversation_id`.
- `POST /chat`: programmatic contract, with `prompt` and optional `conversation_id`/`approval_id`.
- `POST /v1/scan`: advisory preflight `{ "text": "..." }`, never a provider call.
- `GET /api/events` or `/events`: admin-only SSE. Use authenticated `fetch`; native `EventSource` cannot add an Authorization header.
- `GET /api/stats?window=60`: admin-only completed-request statistics, category/action counts, five-minute buckets and overhead percentiles excluding model time. Windows are bounded to 5–1440 minutes.
- `GET /policy`: admin-only policy snapshot. Edit and increment the version in `apps/gateway/policy.yaml` to reload.
- `POST /v1/chat/completions`: use model alias `leakshield`; supported fields are `model`, string-content `messages`, `stream`, and `n: 1`. Unsupported fields are rejected rather than silently discarded. Only a supported text-chat subset is claimed. Client system text is inspected as untrusted context; the gateway owns the privileged system instructions.

Both chat routes return final **plain text**. Never render answers with `innerHTML` or permit automatic remote image fetching. The existing console already renders plain text. `/v1` callers must enforce the same rule.

The ordinary console response contains only the sanitised current user turn in `sent_to_model`. Full `captured_payload` on `/chat`, or `eval.provider_payload` on `/api/chat` with `X-Eval-Capture: 1`, is available only with `EVAL_MODE=true` (or `1`) on loopback. It contains permitted model context and private test markers. Consume it in memory, calculate leak booleans, and discard it. Never log or commit it.

For the **unprotected comparison only**, start a separate local evaluation process with `HOST=127.0.0.1`, `EVAL_MODE=1`, `BASELINE_MODE=true` and synthetic seeded data. Then Arihant's existing `eval/run.mjs --baseline` header is supported. This deliberately omits ACL filtering, masking, quarantine and output checks, using the same provider; raw multi-turn history is encrypted in memory. Ordinary gateway instances reject that header explicitly. Baseline mode cannot start on a public bind address or in Compose. Keep it off for the actual demo and never use real records in this process.

## Verification

```sh
npm run typecheck
npm test
npm run test:integration
npm audit
node eval/validate.mjs eval/contributions/mahatva/dev.jsonl eval/contributions/mahatva/heldout.jsonl
```

Unit tests inject a deterministic fixture detector/provider. Integration tests use **real MongoDB**, the real HTTP provider adapter, and the stock OpenAI client, against a **simulated LLM HTTP server**. The first Mongo integration run may download a large MongoDB binary into a local cache. Detector hand-off tests run when the production detector module exists; otherwise they are explicitly skipped. `TEST_DETECTOR_MODULE` can point to a checkout of Ojaswi's branch without merging or editing it.

The implementation was also checked against Ojaswi's published detector commit `21751c4` and Alwaz's published retrieval implementation using development-only examples and real Mongo. The existing evaluator was run end to end on Mahatva's **dev cases only**, in protected and baseline modes with a simulated model HTTP server; generated reports remained temporary. No held-out cases were run for tuning. Mahatva's 7 dev and 24 held-out contributions live under `eval/contributions/mahatva/` for Arihant to assemble.

## Limits

This is a single-process hackathon gateway: restart discards conversations and pending in-memory state; horizontal scaling needs shared secure session storage. Scanner timeouts cannot interrupt synchronous code that blocks Node's event loop, so detector implementations must bound their computation. ACL effectiveness depends on Alwaz enforcing it inside retrieval as well as this gateway's assembly checks. Canaries/fingerprints are extra checks, not proof against paraphrased leaks. Document-derived PII is irreversibly redacted in this implementation. Real-provider latency, precision/recall, baseline leak reduction, and end-to-end approvals still require the team's live integration and frozen evaluation.

## Access and approvals integration

See [Alwaz access setup and evidence](docs/ALWAZ-ACCESS.md) for seeded documents, scoped tests, the reference demo and classifier feasibility. The production gateway uses the encrypted approval factory in `apps/gateway/src/approvals/gateway.js`.

## No-key merged application demo

`npm run demo:gateway` starts the full merged Express gateway, actual detectors, real temporary MongoDB, audit/SSE/stats, ACL retrieval and encrypted approval replay on loopback. Its upstream is an explicitly simulated local HTTP provider; no cloud call is made. In a second terminal run `npm run dev --workspace @leakshield/web -- --host 127.0.0.1`, then open http://127.0.0.1:5173 . The UI labels the provider as simulated. As Meera, request Garuda, approve in Approvals, then return to Chat. This is reproducible integration evidence, not a real-model answer-quality benchmark.

Before using the normal persistent server, seed its configured database: `node --env-file=.env seed/seed.js`. The seed CLI uses `MONGODB_URI`, `MONGODB_DB` and `FINGERPRINT_KEY`; it resets the named synthetic fixtures. Keep that database separate from production.

### Real local-model verification

With Ollama installed, start an isolated local daemon in one terminal:

```sh
OLLAMA_NO_CLOUD=1 OLLAMA_HOST=127.0.0.1:11435 OLLAMA_MODELS="$PWD/.cache/ollama" ollama serve
```

In another terminal, pull the small smoke-test model and run the metadata-only verification:

```sh
OLLAMA_HOST=127.0.0.1:11435 ollama pull qwen2.5:0.5b
npm run verify:ollama
```

This runs the production gateway pipeline and local HTTP provider with temporary seeded Mongo. It checks real inference and access/privacy boundaries without a cloud key. See [the observed results and fixture limitations](results/alwaz/OLLAMA-VERIFICATION.md). It does not replace the frozen benchmark or browser rehearsal.
