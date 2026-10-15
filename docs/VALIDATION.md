# Validation record — 15 October 2026

- Combined Vitest: 141 passed across actual detector tests, standalone access tests and real HTTP integration tests.
- The eight PLAN §10 boundary checks exercise actual detectors, JWTs, real Mongo, scoped vault, restoration/link order, encrypted approvals and a simulated provider.
- Five seeded values: zero hits in integration audit, incidents, approval metadata and captured logs.
- All 37 access fixtures pass through the HTTP integration; scope/timings are in results/alwaz/http-integration.json.
- The web app passes TypeScript/production build and ESLint using its npm lockfile. Browser access to localhost was rejected by the approval gate, so no visual/browser E2E pass is claimed.
- Optional real fp32 classifier adapter: clean source permitted, injected source quarantined. Both fp32 and locally quantized int8 Node experiments are recorded separately.
- The eight-slide development deck was rendered and visually reviewed through file rendering.
- GitHub device sign-in was completed by the user. Work is published for review at https://github.com/TeamElara/Aevia-AI/pull/1 .

Limits: no authenticated Groq console inspection, real-model baseline, complete frozen dataset, second-laptop rehearsal or real-model demo recording. The reference host deliberately does not implement eval passthrough or production login.
