# Validation record

See results/alwaz/RESULTS.md and its JSON evidence. The earlier in-memory predicate tests were replaced by Vitest tests against a real isolated MongoDB process. Tests cover seed/index behavior, all access fixtures, assembly rechecks, ingestion carriers, request hashes, encryption metadata privacy, replay/expiry, failure handling, response fingerprints and approval result isolation.

Still dependent on absent team modules: full PII/canary scanning, exact vault restoration, restored-value URL sanitization, full audit/incident/log privacy, web chat wiring, real Groq/Ollama payload capture and baseline. No passing result is recorded for those absent components.

The optional real fp32 classifier adapter was exercised on one clean source and one injected source: clean permitted, injection quarantined. All eight slides were rendered and visually reviewed. A clean local clone installed the frozen lockfile and passed its tests/schema validation. An initial GitHub push failed because credentials were missing. The user subsequently completed GitHub’s device sign-in; the branch is now published for review at https://github.com/TeamElara/Aevia-AI/pull/1 .
