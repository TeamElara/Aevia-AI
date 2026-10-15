# Alwaz development evidence

15 October 2026; macOS arm64; Node v24.19.0; local MongoDB 8.2.6.

| Check | Observed |
| --- | --- |
| Vitest security tests | 20 passed, 0 failed |
| Access fixture behavior | 37/37 expected access actions |
| Seeded documents / quarantined | 10 / 2 |
| Local access p50 / p95 | 0.398 ms / 1.398 ms |
| Classifier fp32 warm p50 / p95 | 10.44 ms / 11.97 ms |
| Classifier local int8 warm p50 / p95 | 6.35 ms / 7.96 ms |

Access fixtures use real local MongoDB with simulated provider and explicitly injected pass-through scanner callbacks. The HR employee-master case verifies access only; masking behavior is tested separately using a test-only callback. Access timings cover these 37 development paths, excluding Mongo startup, actual provider/network time, real detectors, and human approval wait. They are not full gateway overhead or final frozen robustness figures. Classifier percentiles cover short English development prompts, not 512-token windows or Hinglish accuracy.

No real-provider baseline, full-team leak rate, independent held-out accuracy, production privacy claim or full demo readiness is asserted. Raw payloads are never written to these reports. Reproduce with `pnpm test`, `pnpm eval:validate` and optionally `pnpm classifier:spike`.
