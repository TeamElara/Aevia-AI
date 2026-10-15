# Independent README-only setup check — 15 October 2026

A second, new standalone remote-main clone at `1876046e1ac260962ae6236f649b8347b0089ca1` was used after PRs #14 and #19 merged. The setup instructions were README.md only. Dependencies and source changes were not copied from another checkout. **Normal persistent-Mongo seed, gateway and web/proxy startup passed.** The browser item subsequently passed on the merged Halo UI: see [final UI evidence](ALWAZ-FINAL-UI.md). The timed joint rehearsal remains a separate human acceptance item.

## What actually ran

- Node 24 and npm 11 supplied the README prerequisites. This Mac does not expose them in its default shell, so the installed bundled Node/npm launcher was used. `npm ci` installed 401 packages, audited 405 and reported zero vulnerabilities; `npm run setup:env` generated independent secrets.
- A standalone MongoDB 8.0.16 process used a persistent data directory inside the clone's ignored `.cache`. Its executable was the already-cached local Mongo binary. This was not `demo:gateway`, `tools/validation-host.ts`, or a temporary database managed by a gateway helper.
- Only ignored, mode-0600 `.env` received the task's private Groq key. The configured model was `openai/gpt-oss-120b`, demo auth enabled, classifier `none`, baseline disabled. No key, token, prompt, answer or provider payload is in this report.
- Existing services occupied 8080/5173, so the dedicated setup used Mongo 27028, gateway 8088 and web 5178. `.env` set the Mongo URI/database and gateway `PORT`/`CORS_ORIGIN`; the web process received matching `GATEWAY_URL` and `VITE_API_MODE=live`. Existing services were left alone.
- The actual README seed command, `npm run seed`, reported **10 documents, 10 chunks and 2 quarantined sources** in the dedicated synthetic database.
- The actual normal gateway command, `npm run dev`, started on 8088. The web command was `npm run dev --workspace @leakshield/web -- --host localhost --port 5178 --strictPort`, with its matching environment above.

| Acceptance check | Observed |
| --- | --- |
| Gateway `/ready` | HTTP 200 |
| Web document | HTTP 200, React root present |
| Web `/api/health` proxy | HTTP 200, real Groq 120b, baseline unavailable |
| Synthetic Asha login through proxy with matching Origin | HTTP 200 |
| Ordinary chat through the web proxy with matching Origin | HTTP 200, 1 real provider call, nonempty answer |
| Tracked source/config/lockfile changes during the test | None |

The proxy check exercised the normal auth/chat routes and matching CORS origin. It does not prove browser rendering, click-through behavior or projector readability. The prior browser attempt returned `ERR_BLOCKED_BY_CLIENT`; no screenshot or completed browser rehearsal is inferred from HTTP success. This is post-freeze setup evidence, not a new v1/v2 evaluation.

## README fixes from the check

README now gives an explicit Mongo startup example, a separate seed command and expected counts, matching database/fingerprint-key requirements, the local rehearsal evaluation flag, frontend-process environment instructions, and port/CORS checks with strict Vite port handling. No gateway or web source was changed.

Stop only the dedicated services from this check after finishing. The ignored persistent data directory and private environment are not committed. The later browser captures are linked in DEMO.md. For the remaining stage rehearsal, Arihant drives and Ojaswi narrates DEMO.md with a stopwatch and records actual participants/elapsed time. The setup check does not substitute for that human run.
