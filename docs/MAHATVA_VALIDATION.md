# Mahatva gateway validation — 15 October 2026

Superseded for final live-provider status by `MAHATVA_FINAL.md`. The tables below record the earlier integration checkpoint; later real Groq, Windows Ollama/fp32, frozen evaluation and clean Linux Docker evidence are linked there.

The checks below verify implementation behavior, not frozen detector accuracy or real-model performance.

| Check | Result |
| --- | --- |
| Gateway TypeScript check | Pass |
| Combined gateway, detector and access unit/security checks | 408 passed |
| Combined integration checks with real MongoDB and HTTP | 49 passed |
| Existing React console production build and lint | Pass; approval polling and canonical API integration connected |
| Dependency audit, including development dependencies | 0 reported vulnerabilities at validation time |
| Compose and CI YAML structure | Pass |
| Shared case format/checksums | 20 dev + 60 held-out + 60 robustness + 10 live-subset valid |

Integration covers the stock OpenAI client, buffered SSE output, real audit persistence/TTL, live audit SSE, actual HTTP provider requests, Ojaswi's public detector APIs, Alwaz's retrieval/assembly/fingerprints, and the full encrypted-approval replay bridge. Revoked ACLs, changed policy, repeated/concurrent approvals, result ownership, ephemeral preflight vaults and helper-based seeded-value privacy are checked. Teammate branches are merged with their authored commits preserved; merge/API integration fixes are recorded separately.

The existing evaluator was also executed end to end against **dev cases only**, both protected and intentionally unprotected, using a simulated model HTTP endpoint. Protected dev fixtures produced no captured provider leaks; the deliberately unprotected fixture run produced leaks. Reports contained only metadata and remained temporary. These are integration assertions with a simulated model, not competition evaluation results.

Mahatva's held-out contribution was format-validated without running it through the gateway or changing rules based on it. Existing access-package tests also exercise Alwaz's authored held-out/robustness fixtures; those assertions are not independent frozen evaluation evidence. No robustness/held-out metrics or final baseline numbers are claimed.

Browser rehearsal on the integrated application passed: synthetic Asha KYC input was masked in the provider inspector and restored in the answer; Meera's Garuda request stayed pending with zero provider calls, admin approved the exact hash, and the original chat received the replayed answer with one provider call. Browser warnings/errors: none observed. The UI explicitly displayed simulated provider throughout. The rehearsal found and fixed the approval client's hash argument and replay timing labels.

Still unverified: real Groq requests/account settings, real Ollama model inference, Windows fp32 classifier inference and Docker startup. Docker and Ollama were not installed on the development host, and no Groq credentials were supplied. A same-machine clean clone is useful verification but does not replace the team's scheduled second-laptop rehearsal. See `CLASSIFIER-GATEWAY.md` for the int8 prediction discrepancy.
