# Mahatva: final implementation and evidence

15 October 2026. Frozen inference source: `eval-freeze^{commit}` = `772a7aff556663a45a8f0904137e0932cd65b177`.

## Final demo handoff, 19:01 IST

All machine-side items in Mahatva's final checklist are handled. See [FINAL-DEMO-READINESS.md](FINAL-DEMO-READINESS.md) for the remaining human rehearsal requirement and [DEMO.md](DEMO.md) for the current script.

- Post-freeze KYC reliability: 10/10 real Groq 120b requests; separate evidence, original frozen v1/v2 reports unchanged.
- Fresh standalone Windows `main` checkout, seeded Mongo, ready local Ollama fallback, actually timed provider switches, final provider Groq 120b and classifier `none`.
- [Five-minute backup](DEMO-VIDEO.md) published outside Git source history, with a verified offline copy on the actual Desktop. Edited screenshots and synthetic narration, not a continuous joint rehearsal recording.
- Two additional automated technical rehearsal passes on the clean demo checkout: 21/21 checks each. Audit/approvals/log privacy checks found no seeded values or configured key; authenticated SSE and backup hash also passed. `results/mahatva/final-demo-readiness.json`.
- Optional v2 benchmark already exists under `results/freeze-v2-groq`; no redundant run. Keep v1 **12 → 1** as the headline and v2 separately labelled, with its prior-exposure caveat.
- Authenticated Groq Personal organization inspection: global and inference ZDR **disabled**; organization base model limits recorded in [GROQ-ACCOUNT-CHECK.md](GROQ-ACCOUNT-CHECK.md). No settings changed; project/key association is not independently proved.

The joint Arihant/Ojaswi runs and physical projector check still need those participants/hardware. Automated HTTP checks do not establish stage timing, narration or their presence. No new product features were added. Entries below preserve the earlier frozen evidence and account-access history.

## Completed

- Production gateway, detector boundaries, privacy/audit, approvals, compatible completion/scan APIs, evaluation capture and isolated baseline.
- 7 development and 24 held-out case contributions; all shared dataset schema checks.
- Actual Groq inference with `openai/gpt-oss-20b` using a locally supplied key. The key is ignored and absent from committed artifacts.
- Actual Windows CPU Ollama `qwen2.5:0.5b`: seven HTTP smoke/boundary checks passed, including masking, zero-call credential blocking, ACL separation and compatible completion. Cloud was disabled in the local daemon.
- Actual Windows fp32 classifier through the gateway adapter: pinned ONNX SHA-256 verified; two authored smoke examples scored as expected. This is not an accuracy/latency benchmark. Default classification stays rules-only, including the frozen runs.
- Actual Docker Compose build/start, Mongo, CPU Ollama inference and seven smoke/boundary checks on a clean GitHub Ubuntu machine. The container runs unprivileged. Windows itself has no Docker/WSL installed.
- A fresh Windows clone installed from its lockfile, passed TypeScript and built the console. This was a second checkout on the same laptop; the separate-machine check was the clean Linux runner, not a physical teammate laptop.
- Frozen Groq protected held-out/robustness and unprotected held-out baseline runs completed without execution errors. Detector misses were analysed after freezing.
- Real-browser rehearsal: masking/restoration and token reuse, credential blocking/replacement, plain/Hinglish/base64 attacks, authorized salary answers, admin replay and incidents. The rehearsal found and fixed SSE snapshot backpressure causing a server crash. A large-snapshot/disconnect regression now covers it. The overview now reports a connection failure instead of silently showing empty statistics.

## Frozen results: keep the misses visible

| Same 60 held-out cases | Protected | Unprotected baseline |
| --- | --- | --- |
| Execution errors | 0 | 0 |
| Provider-leak flags | 1 | 12 |
| User-leak flags | 0 | 1 |
| Exact expected action | 48/60 | 26/60 |
| Intervention precision / recall | 0.821 / 1.000 | undefined / 0 |

This run reduced provider-leak flags by 11/12 (91.7%). It does **not** establish universal zero leakage. H-020 expects IFSC masking, whereas the frozen configurable policy intentionally warns on IFSC, matching the detector hand-off. That bank code therefore reached the provider and is retained as a failing case. Seven of 28 allowed cases received interventions under the evaluator's definition, including conservative document redactions.

Robustness: 60 cases, no execution errors, no provider/user-leak flags, 52/60 exact actions and 0.95 intervention retention. Detector-level analysis found four Hinglish attack misses: R-032, R-033, R-034 and R-037. A different safeguard can cause an intervention even when injection detection missed; intervention recall is not injection-detection recall. The detector report gives the stricter rule-level measurements.

Protected measured-stage overhead p50/p95: 24/70 ms; robustness: 8/65 ms. These exclude model time and audit/vault work outside stage timers. Original `wall_ms` includes deliberate client quota pacing, so it is **not provider latency**; the evaluator was subsequently corrected to wait before starting that timer. No timings were reconstructed or selectively replaced.

The baseline is intentionally naive query retrieval without ACL, masking, quarantine or output filtering; it does not force `attached_doc`. All values are synthetic. These are team-authored sets, and earlier access development tests exercised some Alwaz slices. Treat this as frozen team evaluation, not independently blinded evidence. Model output can vary or refuse a legitimate request; this run is not an answer-quality guarantee. No detector thresholds, corpus, policy or held-out cases changed after observing these results.

## Evidence

- `results/heldout-leakshield.json`, `results/heldout-baseline.json`, `results/robustness-leakshield.json`: case IDs, actions, flags and timings; no raw prompts/answers/payloads.
- `results/mahatva/frozen-provenance.json`: frozen revision, model and file hashes.
- `results/mahatva/detector-misses.md`: post-freeze rule-level misses.
- `results/mahatva/windows-ollama.json`, `windows-classifier.json`, `compose-verification.json`: actual runtime evidence.
- Docker job: https://github.com/TeamElara/Aevia-AI/actions/runs/38718557193 .

## Rehearse

From the root, `npm ci`, then set the provider key/model privately in `.env`. `npm run rehearse:groq` starts the production server on loopback 8080 with temporary seeded Mongo; `npm run dev --workspace @leakshield/web` starts the console. No separate Mongo installation is required for this rehearsal. Use only synthetic fixtures. Restart discards conversations and temporary data.

For offline mode, start the explicitly local Ollama daemon and set `OLLAMA_URL`/`OLLAMA_MODEL`; use `npm run rehearse:ollama` instead of the Groq host. They share port 8080 and must not run simultaneously. For a baseline, use `tsx tools/validation-host.ts --baseline` on isolated loopback port 8081, never the demo server. `EVAL_INTERVAL_MS` optionally paces the evaluator.

Physical projector/second-laptop rehearsal and the organization's private Groq data-retention settings cannot be inferred from these checks. API authentication and observed quota headers are verified; organization-level Zero Data Retention is not. See `GROQ-ACCOUNT-CHECK.md`. A new freeze/evaluation is needed before claiming results for changed detector/pipeline/policy versions.
