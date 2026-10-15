# Real local-model verification — 15 October 2026

The production Gateway and HttpProvider completed 38 direct-pipeline requests using real local Ollama `qwen2.5:0.5b` on macOS arm64. There were 37 actual model calls. All 10 smoke/boundary checks passed: inference, outbound PAN masking, zero-call secret blocking, employee/HR ACL separation, authorized local-only board access, local Garuda permission, seeded audit privacy, and target exclusion in both evaluation slices.

The model digest, source revision, verification-script hash, individual actions and timing metadata are in `ollama-verification.json`. No prompts, model answers, raw provider payloads or model weights are saved. The daemon was started explicitly with `OLLAMA_NO_CLOUD=1`, loopback port 11435 and models under ignored `.cache/ollama`; no login service was installed.

| Measurement | Observed |
| --- | --- |
| Requests / actual model calls | 38 / 37 |
| Explicit smoke/boundary checks | 10/10 |
| Restricted/quarantined target exclusions | 22/22 |
| Measured-stage overhead p50 / p95 | 3.963 / 10.743 ms |
| End-to-end wall p50 / p95 | 259.017 / 2040.947 ms |
| Original fixture action matches | 4/31 |

The last row is a limitation, not a passing accuracy result. Original fixtures describe explicit `attached_doc` decisions and external-provider policy. This run exercised natural-language query retrieval with a local provider: forbidden and quarantined sources are filtered out rather than always producing `deny`/`quarantine`; local Garuda/board requests may call the local model; document PII uses `redact` rather than reversible `mask`. The original expected actions are retained in the report. It does not prove the attached-document API contract or model answer quality. No detector tuning or global eval-freeze tag was performed.

These are unfrozen development measurements across seven smoke requests, sixteen original cases and fifteen paraphrases. Model time is excluded from measured-stage overhead; audit and vault work outside stage timers are also excluded. These percentiles are not total security overhead, independent accuracy, a baseline comparison or browser E2E evidence. The tiny model establishes transport and boundary behavior, not a final deployment model recommendation. Authenticated Groq settings, final frozen model-backed evaluation and rehearsal/recording remain outstanding.

Reproduce after starting local Ollama and pulling the model:

```sh
npm run verify:ollama
```

Override `OLLAMA_URL` (default `http://127.0.0.1:11435/v1`) and `OLLAMA_MODEL` only for an explicitly selected local model. Re-running replaces the metadata report and uses temporary seeded Mongo; it does not change the production database.
