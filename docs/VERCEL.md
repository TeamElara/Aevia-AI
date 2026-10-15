# Vercel console deployment

Import `TeamElara/Aevia-AI` into Vercel with **repository root**, Node **24.x**, and production branch `main`. The root `vercel.json` builds only `@leakshield/web` using the root lockfile. Do not set the Vercel root directory to `apps/web`: Eval imports shared files from the repository and the API transport lives at the root.

The console is deployable without keys. With no `GATEWAY_URL`, `/api/health` returns a structured 503 and the console's existing auto mode visibly selects **mock gateway**. That is a UI demonstration, not real inference, OCR, warnings delivery or an operational privacy gateway. Never claim mock results as live evidence.

For a working integrated private demo, configure the Vercel **server-side** `GATEWAY_URL` to the HTTPS origin of an always-on gateway, without a path, credentials or query. `/api/*` and `/v1/*` then use the same-origin streaming transport. No Groq key, database URI or signing key is needed in the browser or a `VITE_*` variable. `VITE_API_MODE=live` can disable mock fallback once the gateway is deployed and verified.

The existing gateway requires hosted MongoDB, provider credentials and a single long-running instance. Conversation vaults, encrypted approval payloads, replay grants and results remain process-local; ordinary scaled function invocations cannot safely preserve their cross-request semantics. This change deploys the console and transport, not a serverless rewrite of those stateful components. It does not expose the Windows laptop or change its `.env`.

Use a separate synthetic-demo database with the same fingerprint key for seed and gateway. Run `npm run seed` only against that dedicated database. On the hosted gateway set `HOST=0.0.0.0`, the host's `PORT`, `EVAL_MODE=false`, `BASELINE_MODE=false`, `CLASSIFIER_BACKEND=none`, retrieval/approval module paths from `.env.example`, and `CORS_ORIGIN` to the canonical console origin. Keep all keys in the gateway host's private environment.

The seeded passwordless sign-in, including admin, is for a **private protected synthetic demo**. Do not expose `DEMO_AUTH=true` on an unrestricted public gateway; protect both the site and direct gateway access, or implement real user authentication before enabling public real inference. The public static demo alone contains no provider key and makes no real provider calls.

The proxy bounds bodies to 4 MiB; Vercel also has its own payload limit, so the local gateway's 8 MiB upload maximum is not promised on this route. SSE connections reconnect through the console's existing reader after function duration limits. Cookies and arbitrary proxy destination URLs are not forwarded, upstream redirects are not followed, and missing/upstream configuration errors do not contain secrets.

Local verification: `npm run build --workspace @leakshield/web` and `node --test tests/deployment/vercel-proxy.test.mjs`. After deployment check `/`, logo/assets, the visible mode label, `/api/health`, and the browser console. For an integrated hosted gateway rerun masking/restoration, zero-call blocks, ACL, acting-post grant/revoke, warnings identity boundaries and Garuda approval across several separate HTTP requests.
