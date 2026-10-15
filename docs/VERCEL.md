# Hosted LeakShield demo

Import `TeamElara/Aevia-AI` into Vercel with **repository root**, Node **24.x**, and production branch `main`. The root `vercel.json` builds only `@leakshield/web` using the root lockfile. Do not set the Vercel root directory to `apps/web`: Eval imports shared files from the repository and the API transport lives at the root.

Public console: https://leakshield-elara17.vercel.app

The live path is browser → Vercel transport → Render gateway → Atlas / Groq (`openai/gpt-oss-120b`). A Groq key in Vercel alone does not start the gateway or database. Without `GATEWAY_URL`, health returns a structured 503; auto mode may visibly select mock. Mock results are not live evidence.

Production Vercel settings: server-side `GATEWAY_URL=https://leakshield-gateway.onrender.com`, private `GATEWAY_PROXY_SECRET` identical to Render, and public build setting `VITE_API_MODE=live` (rebuild after changing it). `/api/*` and `/v1/*` use the same-origin streaming transport. Provider keys, database URIs and signing keys must never appear in a `VITE_*` variable. Production is public at the user's request; previews retain Vercel authentication.

The existing gateway requires hosted MongoDB, provider credentials and a single long-running instance. Conversation vaults, encrypted approval payloads, replay grants and results remain process-local; ordinary scaled function invocations cannot safely preserve their cross-request semantics. This change deploys the console and transport, not a serverless rewrite of those stateful components. It does not expose the Windows laptop or change its `.env`.

Render runs `leakshield-gateway` on one free Node 24 instance in Ohio. Build: `npm ci --include=dev`. Start: `node --import tsx tools/cloud-start.ts`. Health: `/ready`. Set `DOTENV_CONFIG_PATH=/etc/secrets/leakshield.env` and upload that private secret file through Render. It holds independent signing, audit, fingerprint and proxy secrets, the Atlas URI and Groq credentials. Set `HOST=0.0.0.0`, Render's `PORT`, `EVAL_MODE=false`, `BASELINE_MODE=false`, `CLASSIFIER_BACKEND=none`, retrieval/approval module paths from `.env.example`, and `CORS_ORIGIN` to the canonical console origin.

With `DEMO_AUTH=true` and `SEED_DEMO_ON_START=true`, bootstrap seeds five synthetic identities and ten document chunks into the dedicated `leakshield_cloud_demo` database if not initialized. It refuses to seed another database; existing sample databases are unchanged. Keep the fingerprint key stable across seed and gateway restarts.

The user approved Atlas allowlisting Render Ohio's shared outbound ranges `74.220.50.0/24` and `74.220.58.0/24`. Database authentication is still required. The gateway checks its private transport credential before login and API routes; only exact GET `/health` and `/ready` are public on the origin. Vercel overwrites any client-supplied transport credential with its server-owned copy. Application identity, ACL, masking and approvals still run in the gateway.

This is a **public synthetic hackathon demo**. Seeded sign-in allows visitors to select demo identities, including admin. It is not enterprise authentication: do not ingest real company documents or personal data, and do not treat identity switching as a production permission boundary.

The free Render instance sleeps after inactivity; its first request can take about a minute. A restart ends process-local conversation and pending approval state: start a new chat and recreate pending approvals. Keep one instance. MongoDB persists metadata, not those transient payloads.

The proxy bounds bodies to 4 MiB; Vercel also has its own payload limit, so the local gateway's 8 MiB upload maximum is not promised on this route. SSE connections reconnect through the console's existing reader after function duration limits. Reserved `route` and `path` rewrite parameters are stripped before forwarding application queries. Cookies and arbitrary proxy destinations are not forwarded, upstream redirects are not followed, and errors do not contain secrets.

Hosting does not change policy, detector thresholds, frozen evaluation corpora or headline numbers. Live smoke checks are deployment checks, not a new frozen benchmark. Hosted OCR and extension operation are not established by chat checks.

Local verification: web build, proxy tests, gateway config/proxy-auth tests and the disposable cloud bootstrap check. After deployment check anonymous `/`, assets, the **live gateway** label and a real rendered answer. Exercise masking/restoration, zero-call blocks, salary ACL, Garuda approval (hash, owner, replay), admin stats, authenticated metadata-only SSE and warning availability across separate HTTP requests. Scan the delivered browser bundle for accidental inclusion of configured secrets without printing their values.
