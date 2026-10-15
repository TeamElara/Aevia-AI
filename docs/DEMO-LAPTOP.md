# Demo laptop: ready

## ReDoS and Halo UI deployment verification

Verified on 15 October 2026 against clean demo-laptop `main` at `0c560db7e2671d024a3f773b89fe34703e353ffc`, after both the ReDoS/sanitizer hotfix (#25) and Halo UI (#31) merged. Dependencies were installed from the lockfile and the gateway/console were restarted from that checkout. The persistent synthetic Mongo fixtures and pre-pulled Ollama fallback remain available.

- **498 unit/security/component + 54 integration = 552 tests passed**, including isolated 50 KB detector/sanitizer regressions. Gateway/access TypeScript, web production build and lint passed.
- **Two live Groq technical passes: 21/21 checks each**, covering KYC masking/restoration, secret/injection blocking, ACL/quarantine, approval ownership/hash/single-use, compatible endpoints, SSE and stats. Audit, encrypted-approval storage and gateway stdout/stderr checks found none of the seeded test values or configured key.
- The actual restarted gateway blocked five 29,063-character synthetic injection probes (newlines, spaces, tabs, NBSP and mixed spaces/tabs), each at zero provider calls. Observed HTTP wall times were 20–42 ms; this is a smoke sample, not a universal latency guarantee.
- The merged live console rendered a KYC answer with restored synthetic identifiers; its inspector showed masked Aadhaar/PAN tokens and one model call. No browser console errors were observed during that check.
- The existing offline backup hash still matches. That recording predates Halo and does **not** establish that the new UI was recorded.

Metadata-only evidence: [postmerge-demo-readiness.json](../results/mahatva/postmerge-demo-readiness.json). This verifies deployment of the specific post-freeze hotfix; frozen v1/v2 reports and tags are unchanged. It is not a new held-out evaluation or two joint driver/narrator rehearsals. #30 was closed as superseded by the whitespace fix in #25; vertical-tab/form-feed role-header coverage remains deferred to v3. IFSC remains warn for the current demo.

## Original setup and earlier checks

15 October 2026. The actual Windows machine has a fresh, standalone clone of remote `main` under `Documents/LeakShield-Demo`. It is a normal checkout with no Codex branch/worktree and an empty `git status --porcelain`. The private `.env`, dependencies and local runtime/data cache are ignored. The installed system Node/npm/Git work outside Codex.

## Configured and verified

- Groq: `openai/gpt-oss-120b`; `DEMO_AUTH=true`; `CLASSIFIER_BACKEND=none`; `BASELINE_MODE=false`.
- Production gateway on loopback 8080, real persistent MongoDB on loopback 27017 in the dedicated `leakshield_demo` database, console at `http://localhost:5173`.
- `npm ci` and `npm run seed` completed: 10 synthetic documents/chunks, including two quarantined sources.
- Real Groq KYC masking/restoration and zero-call credential blocking passed from this clean clone.
- Portable Ollama and the already-pulled `qwen2.5:0.5b` model are cached in this clone. The local daemon is loopback 11435 with cloud disabled; inference needs no model download.
- Actually changed `LLM_PROVIDER=ollama`, restarted the production gateway and obtained a real model answer. Authorized local Garuda used one call without external approval, as expected.
- Switched back to Groq. Garuda paused at zero calls, admin approval validated the hash, and the answer returned to Meera after one call.
- Final state: Groq 120b running; no source changes; console reachable. The API key is local and is not committed or included in evidence.
- Final technical rehearsal: two automated HTTP passes, 21/21 checks each, plus audit/approval/log privacy and backup-hash checks. See `results/mahatva/final-demo-readiness.json`; this is not two joint driver/narrator rehearsals.
- Backup MP4 is also on the actual Windows Desktop as `LeakShield-Backup-5min.mp4`, outside Git. Its hash matches the published release; see `docs/DEMO-VIDEO.md`.

## Observed switch time

| Transition | Gateway ready | First actual answer, including restart |
| --- | --- | --- |
| Initial Groq startup | 1.139 s | 2.700 s (KYC) |
| Groq → Ollama | 0.814 s | 2.952 s (greeting) |
| Ollama → Groq | 1.123 s | 2.265 s (Garuda, including login and approval replay) |

These are one observed scripted switch on this laptop, starting before changing the provider and stopping the old process. Manual editing time is not included. A cold model load, other machine load or a provider outage can take longer. Metadata-only evidence and the tested revision are in `results/mahatva/demo-laptop-readiness.json`. This is a post-freeze setup/rehearsal check, not a new v1/v2 evaluation.

## Start again after a reboot

Open separate terminals in `Documents/LeakShield-Demo`. The local runtime files below are cached on the prepared laptop and deliberately absent from Git.

1. Mongo:

   ```powershell
   .\.cache\mongodb\mongod.exe --dbpath .cache/mongodb/data --bind_ip 127.0.0.1 --port 27017 --logpath .cache/mongodb/mongod.log --logappend
   ```

2. Ollama fallback daemon (keep ready while demonstrating Groq):

   ```powershell
   $env:OLLAMA_HOST='127.0.0.1:11435'
   $env:OLLAMA_NO_CLOUD='1'
   $env:OLLAMA_MODELS=Join-Path $PWD '.cache/ollama-models'
   $env:OLLAMA_NUM_PARALLEL='1'
   .\.cache\ollama-runtime\ollama.exe serve
   ```

3. Gateway: `npm start`.
4. Console: `npm run dev --workspace @leakshield/web -- --host localhost`.

Open `http://localhost:5173`. Do not launch duplicate copies while the existing services already occupy these ports. Seeding is already complete; `npm run seed` is available to reset the dedicated synthetic fixtures when needed.

To fall back, stop the gateway, change only `LLM_PROVIDER=groq` to `LLM_PROVIDER=ollama` in the private `.env`, and run `npm start` again. Refresh the console/start a new chat because restart clears conversations and pending approval payloads. To return, use `LLM_PROVIDER=groq` and restart again. Show the Garuda **approval** scene on Groq: authorized local Ollama does not require external-provider approval. Keep this demo setup on loopback and use synthetic fixtures only.
