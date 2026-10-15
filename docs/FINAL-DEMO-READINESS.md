# Mahatva's final demo checklist

15 October 2026. This is a handoff of the requested final tasks, not a new feature/freeze or a claim that teammates attended rehearsals.

| Requested item | Final status / evidence |
| --- | --- |
| KYC refusal reliability | Done: PR #12; 10/10 real Groq 120b checks. Separate post-freeze evidence in `results/mahatva/kyc-demo-reliability.json`. |
| Five-minute backup | Done: [download and chapter handoff](DEMO-VIDEO.md). Verified offline MP4 on Desktop; no video in Git source history. Edited real screenshots/API outputs and narration. |
| Demo laptop | Done: fresh clean `main`, private environment, seeded Mongo, real Groq 120b, `DEMO_AUTH=true`, `CLASSIFIER_BACKEND=none`, already-pulled local Ollama and measured round-trip switch. [Startup and fallback](DEMO-LAPTOP.md). |
| Optional v2 run | Already done by the team: `results/freeze-v2-groq/RESULTS.md`. No duplicate run. Keep headline v1 12 → 1; show v2 separately as a later freeze with prior case exposure. |
| Groq account inspection | Done for signed-in Personal organization: Global ZDR and Inference APIs ZDR **Disabled**; 120b/20b organization base RPM/RPD/TPM/TPD recorded. No settings changed. [Scope and judge answer](GROQ-ACCOUNT-CHECK.md). |
| Misses and Q&A | [LIMITATIONS.md](LIMITATIONS.md), current [demo script](DEMO.md) and backup retain the misses. No universal zero-leakage or zero-retention claim. |
| Bugs-only final readiness | Two automated technical passes, 21/21 checks each; privacy, metadata SSE, clean checkout and backup integrity passed. No product decision files changed. |
| Joint rehearsals / projector | **Human step remains:** Arihant drives, Ojaswi narrates, Mahatva supports gateway. Two team runs and actual projector visibility cannot be completed by HTTP automation. |

## Measured technical checks

`results/mahatva/final-demo-readiness.json` records two passes against real Groq 120b from clean demo `main` at `c8f55ce`. Each pass covers KYC full-outbound masking/restoration, scoped token reuse, credential block/replacement, English/Hinglish/base64 blocks, explicit salary ACL/impersonation, authorized Ravi, poisoned attachment quarantine, Garuda pause, wrong-hash rejection, original-owner result, single-use replay, compatible completion/scan, admin stats and authenticated metadata SSE. It also exercises the five existing privacy-helper values.

The final persisted-surface scan covered 269 audit records, two approval records and the gateway log: no seeded-value or configured-key hits. Report contains check names and booleans, never raw requests, model answers, payloads, credentials or tokens. This bounded synthetic check is not proof against every possible disclosure. Baseline remains disabled on the demo host.

The two technical passes took approximately 5.3 and 7.0 seconds; those are scripted checks, **not five-minute stage rehearsals**. Human pacing and narration still need practice.

## Team rehearsal handoff

Use `docs/DEMO.md` as the running order. Keep Groq selected for the approval scene; the already-tested local Ollama fallback does not require external-provider approval. Start a new chat after changing identity or restarting. Use seeded Amber/Indigo salary figures; there is no L5 band. In Eval, H-032 carries an explicit salary attachment and demonstrates DENY/zero calls; plain Chat can simply exclude the restricted source and remain ALLOWED. The vendor fixture has no clean alternative policy, so do not promise a clean-doc answer.

Before the first team run, open the Desktop backup and the console, check projector readability, and agree the driver/narrator transitions. Record actual participants, elapsed time, failures and whether the second run stayed within five minutes. No meeting slots or attendance are asserted here.

For Q&A: approved content can reach Groq; the inspected Personal organization's inference ZDR is disabled. The retained frozen provider flag is H-020 IFSC under warn policy. Four detector-level Hinglish misses and false positives remain documented. Current 120b live subset was 9/10, with one benign false positive and zero observed leaks; it is separate from frozen 20b v1/v2 results.
