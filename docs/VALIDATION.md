# Validation record — 15 October 2026

- Combined default Vitest: 410 passed; additional real-service integration suite: 21 passed across actual detector tests, standalone access tests and real HTTP integration tests.
- The eight PLAN §10 boundary checks exercise actual detectors, JWTs, real Mongo, scoped vault, restoration/link order, encrypted approvals and a simulated provider.
- Five seeded values: zero hits in integration audit, incidents, approval metadata and captured logs.
- All 37 access fixtures pass through the HTTP integration; scope/timings are in results/alwaz/http-integration.json.
- The web app passes TypeScript/production build and ESLint using its npm lockfile. Browser access to localhost was rejected by the approval gate, so no visual/browser E2E pass is claimed.
- Optional real fp32 classifier adapter: clean source permitted, injected source quarantined. Both fp32 and locally quantized int8 Node experiments are recorded separately.
- The eight-slide development deck was rendered and visually reviewed through file rendering.
- GitHub device sign-in was completed by the user. Work is published for review at https://github.com/TeamElara/Aevia-AI/pull/1 .

Limits: no authenticated Groq console inspection, real-model baseline, complete frozen dataset, second-laptop rehearsal or real-model demo recording. The reference host deliberately does not implement eval passthrough or production login.

Full production-gateway approval bridge: four checks pass with actual Express, Mongo, detector, vault, policy, audit and loopback HTTP transport. Both root package managers have lockfiles; detector workspace Vitest tooling is aligned with the root runner to avoid duplicate test runtimes.

## Latest GitHub publication

The branch includes `main` at `7d1e305` (detector PR #3), preserving the latest detector source. After resolving the merge, `pnpm test` passes 410 tests and `pnpm test:integration` passes 21 tests (431 total). Production and access TypeScript checks, the web production build and ESLint pass. Evaluation format validation passes for the complete root dev/held-out/robustness sets (20/60/60) and Alwaz's separate slices.

The detector optional Transformers peer range accepts both v3 and the v4 runtime used by the recorded classifier spike; root and standalone npm lockfiles are refreshed. The editable deck retains its earlier 219 + 21 test snapshot; the counts above are the latest combined validation. Classifier and reference-host timing reports retain their original measurement scope.

Source, fixtures, tests, evaluation data, reports, documentation and the deck are committed. Ignored dependencies, build output, model caches and local secrets are excluded. The pull request remains the publication/review location; publishing the branch does not merge it into `main`.
