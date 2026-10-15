# LeakShield — Alwaz: access and approvals

Access-control and approval modules for the team plan in `docs/PLAN.md`. Includes a runnable HTTP integration host using Ojaswi’s detector branch and a connected approvals UI. The local host uses an explicitly simulated provider; team-account Groq verification and a real-model baseline remain external dependencies.

## Reproduce

Install Node.js 22+ and pnpm 11.25.0, then run:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck:access
pnpm eval:validate
```

Tests automatically download MongoDB on first run and start an isolated local database, then stop it. No Docker, real provider credentials or external Mongo account is required. Tests use a deterministic simulated provider and explicitly injected scanner callbacks. The suite covers access boundaries, the actual detector package, real HTTP/JWT integration, scoped masking/restoration, link sanitization and encrypted approvals. All provider responses used by these tests are explicitly simulated.

For an existing local MongoDB, copy `.env.example`, export its values in your shell, then run `pnpm seed`. Generate independent JWT and fingerprint secrets with `openssl rand -hex 32`; no default secrets are shipped. Set `MONGO_URL` if different from `mongodb://localhost:27017`. Run `node seed/seed.js --tokens` to write one-hour demo JWTs to ignored `seed/tokens.json`. The scripts read shell environment variables; they do not automatically load `.env`.

## Implemented

- Ten synthetic documents matching PLAN §7; two poisoned sources are quarantined.
- Asha employee, Ravi HR, Meera engineering, CEO per-user grant, admin approval role without document bypass.
- Mongo `$text` search and group/per-user ACL predicate before top-k, then fresh ACL/content checks at assembly.
- `external_llm: allow | approval | deny`, eight-word keyed fingerprints and conservative source scanning.
- AES-GCM encrypted in-memory approval queue, ten-minute expiry, metadata/request hash in Mongo and single-use replay with current membership/policy checks.
- Access-service callback integration and Express-compatible routes; optional local ingest classifier.
- Six dev, sixteen held-out and fifteen paraphrase cases using the agreed schema.

Run `pnpm test:report` when deliberately refreshing the measured access report; ordinary tests leave committed results unchanged.

Evidence: [results](results/alwaz/RESULTS.md), [classifier decision](docs/CLASSIFIER-DECISION.md), [handoff](docs/ALWAZ-HANDOFF.md), [eight-slide deck](docs/Alwaz-LeakShield.pptx).

Run `pnpm classifier:spike` separately to download the pinned English classifier and measure Node feasibility. This downloads approximately 713 MB; model weights stay ignored in `.cache`. The classifier is optional and not a substitute for ACLs. The locally quantized variant can be reproduced using `tools/quantize-classifier.py` with Python ONNX dependencies; the normal upstream model supports the default full-precision path.

## Run the complete local access demo

Terminal 1:

```sh
pnpm demo:access
```

Terminal 2:

```sh
npm ci --prefix apps/web
npm run dev --prefix apps/web -- --host 127.0.0.1
```

Open http://127.0.0.1:5173 . The UI labels **simulated provider**. Mongo is temporary, demo JWT/fingerprint keys are generated in memory, and the host binds only to loopback. No passwords or API keys are needed for this demo. The echo provider demonstrates boundaries, not model answer quality.

As Meera, send “Garuda roadmap”. Keep that chat open. Open the Approvals view, which uses a separate seeded admin session, then approve or reject. Return to Chat for the result. The requester’s chat polls for its own result. Admin sees metadata and a countdown. Try Asha → salary (denied), Ravi → salary (allowed), and Meera → payments (fake credential blocks with zero provider calls).

The reference host under `retrieval/integration` is isolated from Mahatva’s eventual production entry point. It provides demo login only when explicitly enabled. Production authentication and deployment hardening are not supplied by the demo. The optional compatible transport supports Groq/Ollama, but actual provider/account access has not been verified. Incidents/Overview rely on the team’s eventual dashboard endpoints; this reference host connects Chat and Approvals. The eval passthrough header is not implemented in this host; do not use it as a baseline runner.

`pnpm test:integration:report` deliberately refreshes the HTTP evidence. Normal tests do not rewrite committed reports. The shared evaluator’s full frozen/baseline run uses the assembled team cases but still needs a coordinated freeze and a real provider.

For an explicitly configured real provider, export `ACCESS_PROVIDER=groq`, `GROQ_API_KEY` and `GROQ_MODEL` locally, or `ACCESS_PROVIDER=ollama`, `OLLAMA_MODEL` and optionally `OLLAMA_URL`. Then restart the loopback host. These transports are protocol-tested with injected responses; the production HttpProvider has now completed real local Ollama verification (see `results/alwaz/OLLAMA-VERIFICATION.md`); Groq behavior remains unverified. No key should be committed or pasted into chat.

The full merged application is now available via `npm run demo:gateway`, including production gateway audit/SSE/stats and the approval bridge. The isolated `demo:access` host above remains a reference. Prefer the merged demo for rehearsals.
