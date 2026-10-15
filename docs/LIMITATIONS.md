# Limitations and judge Q&A

## Scope of the evidence

The v2 source is tagged before the new model runs. These are team-authored datasets, not an independently blinded benchmark: earlier access tests exercised Alwaz slices. Report exact actions, leak flags and failures together. A finite run with zero flags cannot establish universal zero leakage. The baseline is intentionally unprotected synthetic retrieval, not another production security product.

## Detection and model trade-offs

Frozen v2 rule analysis finds 32/36 injection cases across the held-out/robustness sets. Four Hinglish misses remain: R-032, R-033, R-034 and R-037. R-033 scores 0.70, below the 0.85 block threshold. Detector mutation retention is 20/24 (83%); gateway intervention retention is a different metric because ACL, approval and output controls can intervene without detecting injection. H-045 flags a secret-shaped value in a legitimate security discussion. Do not tune against these disclosed misses and then reuse the same results as independent evaluation.

The real fp32 classifier flagged 19/110 benign prompts (about 17%). Some benign scores overlap attack scores, and a long input exceeded the normal scanner timeout. CLASSIFIER_BACKEND=none is the selected demo/evaluation setting. The earlier int8 speed spike is feasibility history; the production adapter refuses int8 after prediction discrepancies. We did not train a new model.

## Policy and access

The configured IFSC policy warns rather than masks. H-020 expects its value withheld from the provider, so a corresponding leak flag must remain visible if observed. User-origin PII can be restored through its scoped vault; document-origin PII is irreversibly redacted. Explicit attachments use a validated ACL-checked path; natural-language retrieval remains lexical, not semantic. Relevance filtering reduces incidental matches but can miss legitimate references.

HMAC shingles detect copying, not arbitrary paraphrases. Database state can still change between checks; this is not transactional authorization across a long model request. Approval payloads and conversations are process-local and bounded; restart discards them. Multiple workers need an owning-worker/shared-state design. Admin approval authority does not bypass document ACLs.

## Groq and privacy

Masked prompts and approved reference content do reach Groq. Never answer that no data leaves the gateway. On 15 October 2026 at 19:01 IST, the signed-in Personal organization / Default Project showed both Global ZDR and Inference APIs ZDR **Disabled**. Its organization base limits for both Groq 20b/120b were RPM 30, RPD 1,000, TPM 8,000 and TPD 200,000. Project overrides and association of the demo API key with that organization were not independently established, so do not extrapolate to other accounts. No settings were changed. See docs/GROQ-ACCOUNT-CHECK.md and results/mahatva/groq-account-console.json; historical unauthenticated checks remain as history.

Groq's public policy distinguishes usage metadata from inference data and allows retention exceptions unless the relevant controls are enabled. Source: https://console.groq.com/docs/your-data (rechecked 15 October 2026). Provider policy and the account-specific observations above are separate evidence. Test data is synthetic. Keys remain local and must never appear in reports, deck notes or Git commits.

## Timing and deployment

Percentiles identify the machine, source, model, sample count and measured scope. Instrumented-stage overhead excludes inference and uninstrumented audit/vault work; it is not total security overhead. Do not compare it directly with an older reference-host measurement. Previous Windows Ollama, fp32 and clean Linux Docker evidence is in docs/MAHATVA_FINAL.md; no new physical teammate/projector rehearsal or joint narration session is implied.

## Legal mapping

The DPDP slide maps technical controls to Act sections 6(1), 8(5), 8(6) and 8(7). It does not establish compliance, lawful consent, breach-notification operations, complete erasure or cross-border-transfer compliance. Primary reference: https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf .
