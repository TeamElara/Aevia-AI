# Independent clean-clone check — 15 October 2026

Alwaz cloned the remote repository into a new standalone checkout at `fbc4691`, without copying another checkout's dependencies or uncommitted source changes. README.md and DEMO.md were the starting instructions. This is a setup/HTTP check; **the complete console rehearsal and its five-minute acceptance remain pending**.

| Check / point of friction | Actual result / resolution |
| --- | --- |
| Node/npm prerequisites | This Mac's shell did not expose Node/npm. Used the installed bundled Node 24 runtime and npm 11 launcher. This is a machine prerequisite, not a repository dependency fix. |
| Locked installation | `npm ci`: 401 packages installed, 405 audited, zero reported vulnerabilities. No lockfile changed. |
| Initial secrets | `npm run setup:env` succeeded and generated independent local secrets. A privately supplied task key was copied only into ignored mode-0600 `.env`; no key was printed or committed. |
| Rehearsal flags | Generated `.env` has `DEMO_AUTH=false`, `EVAL_MODE=false`, and empty provider credentials/model. README already describes demo auth/provider setup; it now explicitly describes the loopback-only evaluation flag required by DEMO.md. |
| Mongo prerequisite | There was no `mongod` executable in the shell. The regular persistent-Mongo `seed` path could not be completed as a README-only startup on this machine. Instead, the existing `tools/validation-host.ts` provided a temporary real seeded MongoDB for a separate HTTP check. This detour is not proof that normal persistent setup was rehearsed. |
| Port collision | An existing simulated gateway and old-checkout Vite occupied 8080/5173. They were left running. The new validation host used 8086; cloned Vite used 5176 with `GATEWAY_URL` pointing to that host. Readiness and the Vite health proxy returned HTTP 200 and identified real Groq 120b. |
| Frontend env/origin | Set `VITE_API_MODE` on the frontend process. A root gateway `.env` is not sufficient. For actual browser requests, a changed console port also requires a matching gateway `CORS_ORIGIN`; the existing validation helper hardcodes 5173, so the alternate-port health probe is not an accepted browser configuration. README now calls out this requirement and `--strictPort`. |
| Browser | Opening the existing console at `http://localhost:5173` returned `net::ERR_BLOCKED_BY_CLIENT`. No click-through, screenshots, projector check, or browser-derived result was obtained. |
| Garuda HTTP check | On real Groq 120b: pending/0 calls, pre-approval poll 202, exact-hash admin approval, Meera answer/1 call, second result read 404. Separate from the browser limitation and frozen 20b evaluation. |
| Stopwatch | The Garuda API sequence took 889 ms. That is a single automated smoke sequence, **not** total demo duration. The live driver/narrator run has no measured finish time here; do not replace it with the existing edited video's 300.05-second duration. |

No gateway, web, policy, detector, corpus, evaluation case or frozen report was modified. No frozen result was rerun or relabelled. Temporary services started for this check are stopped after the check; earlier services are left alone.

## Remaining acceptance

After PR #14's teammate review and merge, use the agreed final main revision and refresh the clean checkout. On the actual demo laptop, start the documented persistent Mongo, seed the dedicated synthetic database, and run gateway/console on their matching origins. With a working browser, Arihant drives and Ojaswi narrates the existing DEMO.md order with a stopwatch, including any planned optional cuts. Record the actual elapsed time, retain two Garuda UI states, and log every remaining instruction gap. This report does not claim that joint or five-minute acceptance has passed.
