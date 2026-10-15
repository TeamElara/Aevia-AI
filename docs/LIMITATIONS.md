# Limitations and judge Q&A

## Scope of the evidence

The v2 source is tagged before the new model runs. These are team-authored datasets, not an independently blinded benchmark: earlier access tests exercised Alwaz slices. Report exact actions, leak flags and failures together. A finite run with zero flags cannot establish universal zero leakage. The baseline is intentionally unprotected synthetic retrieval, not another production security product.

## Detection and model trade-offs

Frozen v2 rule analysis finds 32/36 injection cases across the held-out/robustness sets. Four Hinglish misses remain: R-032, R-033, R-034 and R-037. R-033 scores 0.70, below the 0.85 block threshold. Detector mutation retention is 20/24 (83%); gateway intervention retention is a different metric because ACL, approval and output controls can intervene without detecting injection. H-045 flags a secret-shaped value in a legitimate security discussion. Do not tune against these disclosed misses and then reuse the same results as independent evaluation.

The real fp32 classifier flagged 19/110 benign prompts (about 17%). Some benign scores overlap attack scores, and a long input exceeded the normal scanner timeout. CLASSIFIER_BACKEND=none is the selected demo/evaluation setting. The earlier int8 speed spike is feasibility history; the production adapter refuses int8 after prediction discrepancies. We did not train a new model.

## Post-freeze red-team check

Ojaswi submitted 50 new synthetic attacks to the full gateway with a **simulated loopback provider**. Results: **32 stopped before the provider, 1 warned only, 17 bypassed, 0 errors**. Bypasses were **7/10 Hinglish, 3/8 Devanagari, 4/8 roleplay and 3/6 split-line** cases. Language coverage and roleplay remain weaknesses. A bypass in this run means gateway controls allowed the attack through; this run does not establish that a real model disclosed data. See the [pinned red-team report](https://github.com/TeamElara/Aevia-AI/blob/d7416b5ca3a3513a290ba2a814b56a9810484a2c/results/ojaswi/redteam.md) and the [canonical judge Q&A](JUDGE-QA.md#detection-deep-dive-ojaswi).

The report rows contain 12 encoding cases (six zero-width and six single-case encodings), all stopped; the draft's count of 11 was an arithmetic error. This finite result is not a general obfuscation guarantee. The post-freeze red-team set is separate from the frozen real-Groq runs: **53/60 exact held-out actions, 56/60 robustness actions and 12 → 1 provider-leak flags** remain unchanged. Do not report 17 bypasses as 17 measured provider leaks, or combine the two evaluations.

## ReDoS finding and remediation status

The post-freeze adversarial audit covered **111 regexes × 51 inputs of 50,000 characters** on Apple M3 / Node 26.8.1. The structural role-header pattern exceeded the **15-second worker cutoff** on newline-heavy input, and two markdown patterns took about **2.5 seconds** in the audit. Because detection runs synchronously, a long regex can block the gateway event loop for other users; a Promise timeout does not preempt it. The [audit report](https://github.com/TeamElara/Aevia-AI/blob/b52ed3b75ba06c0b54ef9a54434eef7b03af92e8/results/ojaswi/redos-audit.md) also records slow normalisation/decoding cases.

**Corrected in the merged post-freeze hotfix:** [PR #25](https://github.com/TeamElara/Aevia-AI/pull/25) merged as `e13e80c`, incorporating Ojaswi's initial change and Mahatva's review corrections through `eca2822`. The fix separates optional-marker indentation to remove residual whitespace backtracking, bounds structured link/tag candidates without truncating the whole input, and fixes fallback sanitizer rescanning. [Current detector regression tests](../packages/detectors/test/redos.test.ts) cover 11 authored 50,000-character families through both `detectAll` and `findLinks`, with separate behavior tests. [Sanitizer regressions](../apps/gateway/tests/sanitise-redos.test.ts) cover the helper and fallback paths. Each timing worker has a 3-second termination deadline; measured work excludes startup and uses the fastest of three warm samples below 50 ms. This is a targeted regression gate, not a universal worst-case or whole-request latency guarantee.

The first PR attempt failed at **53.69686 ms**, with 473 tests passed and 1 failed; that historical failure is [retained in CI](https://github.com/TeamElara/Aevia-AI/actions/runs/38763381901/job/116520199999). The corrected head's [gateway CI](https://github.com/TeamElara/Aevia-AI/actions/runs/38766333998/job/116530381980) and security checks pass. Alwaz's local post-freeze verification passed **493 unit/security/component tests plus 54 integration tests (547 total)**; the exact owner head's TypeScript and nine sanitizer regressions were rechecked after its final import correction. No test timing limit was raised.

This verifies the corrected source; **the actual Windows demo-laptop pull/rehearsal and backup refresh remain Mahatva's separate acceptance step after UI merge**. Do not claim that a source merge proves the running laptop or recording is updated. `eval-freeze-v2`, its reports, expectations and IFSC warning policy remain unchanged. The existing [realistic-input detector benchmark](https://github.com/TeamElara/Aevia-AI/blob/3e8fb05717333b0b211f983182ef1fca57153e61/results/ojaswi/bench.md) measured `detectAll` p50/p95 at 43.7/47.6 ms for its 50 KB sample; those ordinary timings do not bound every adversarial case.

## Policy and access

The configured IFSC policy warns rather than masks. H-020 expects its value withheld from the provider, so a corresponding leak flag must remain visible if observed. User-origin PII can be restored through its scoped vault; document-origin PII is irreversibly redacted. Explicit attachments use a validated ACL-checked path; natural-language retrieval remains lexical, not semantic. Relevance filtering reduces incidental matches but can miss legitimate references.

HMAC shingles detect copying, not arbitrary paraphrases. Database state can still change between checks; this is not transactional authorization across a long model request. Approval payloads and conversations are process-local and bounded; restart discards them. Multiple workers need an owning-worker/shared-state design. Admin approval authority does not bypass document ACLs.

## Groq and privacy

Masked prompts and approved reference content do reach Groq. Never answer that no data leaves the gateway. On 15 October 2026 at 19:01 IST, the signed-in Personal organization / Default Project showed both Global ZDR and Inference APIs ZDR **Disabled**. Its organization base limits for both Groq 20b/120b were RPM 30, RPD 1,000, TPM 8,000 and TPD 200,000. Project overrides and association of the demo API key with that organization were not independently established, so do not extrapolate to other accounts. No settings were changed. See docs/GROQ-ACCOUNT-CHECK.md and results/mahatva/groq-account-console.json; historical unauthenticated checks remain as history.

Groq's public policy distinguishes usage metadata from inference data and allows retention exceptions unless the relevant controls are enabled. Source: https://console.groq.com/docs/your-data (rechecked 15 October 2026). Provider policy and the account-specific observations above are separate evidence. Test data is synthetic. Keys remain local and must never appear in reports, deck notes or Git commits.

## Timing and deployment

Percentiles identify the machine, source, model, sample count and measured scope. Instrumented-stage overhead excludes inference and uninstrumented audit/vault work; it is not total security overhead. Do not compare it directly with an older reference-host measurement. Previous Windows Ollama, fp32 and clean Linux Docker evidence is in docs/MAHATVA_FINAL.md; no new physical teammate/projector rehearsal or joint narration session is implied.

## Post-freeze repeated-risk escalation

An optional, default-off supervisor warning feature is documented in [SECURITY-ESCALATION.md](SECURITY-ESCALATION.md). It counts selected authenticated policy interventions over 15 minutes and routes metadata-only in-app warnings through a trusted hierarchy, with independent review of administrator activity. It does not detect all malicious intent, eliminate existing detector false positives/negatives, establish misconduct, suspend users or imply a disciplinary decision. Access-denial signals include missing references; credential pasting can be accidental. No prompt values are disclosed to managers. Delivery is in-app, with retry and at-least-once audit semantics; external notification services are not configured. Frozen reports, test datasets and IFSC policy are unchanged.

## Legal mapping

The DPDP slide maps technical controls to Act sections 6(1), 8(5), 8(6) and 8(7). It does not establish compliance, lawful consent, breach-notification operations, complete erasure or cross-border-transfer compliance. Primary reference: https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf .
