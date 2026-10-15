# Mahatva gateway validation — 15 October 2026

The checks below verify implementation behavior, not frozen detector accuracy or real-model performance.

| Check | Result |
| --- | --- |
| Gateway TypeScript check | Pass |
| Combined gateway, detector and access unit/security checks | 319 passed |
| Combined integration checks with real MongoDB and HTTP | 43 passed |
| Existing React console production build | Pass; two API integration files updated, components/design unchanged |
| Dependency audit, including development dependencies | 0 reported vulnerabilities at validation time |
| Compose and CI YAML structure | Pass |
| Shared case format/checksums | 20 dev + 60 held-out + 21 robustness valid |

Integration covers the stock OpenAI client, buffered SSE output, real audit persistence/TTL, live audit SSE, actual HTTP provider requests, Ojaswi's public detector APIs, Alwaz's retrieval/assembly/fingerprints, and the full encrypted-approval replay bridge. Revoked ACLs, changed policy, repeated/concurrent approvals, result ownership, ephemeral preflight vaults and helper-based seeded-value privacy are checked. Teammate branches are merged with their authored commits preserved; merge/API integration fixes are recorded separately.

The existing evaluator was also executed end to end against **dev cases only**, both protected and intentionally unprotected, using a simulated model HTTP endpoint. Protected dev fixtures produced no captured provider leaks; the deliberately unprotected fixture run produced leaks. Reports contained only metadata and remained temporary. These are integration assertions with a simulated model, not competition evaluation results.

The held-out contribution was format-validated without running it through the gateway or changing rules based on it. No robustness/held-out metrics or final baseline numbers are claimed.

Still unverified: real Groq requests/account settings, real Ollama model inference, Windows fp32 classifier inference, Docker startup and browser rehearsal on the complete merged application. Docker and Ollama were not installed on the development host, and no Groq credentials were supplied. A same-machine clean clone is useful verification but does not replace the team's scheduled second-laptop rehearsal. See `CLASSIFIER-GATEWAY.md` for the int8 prediction discrepancy.
