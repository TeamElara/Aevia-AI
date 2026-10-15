# Alwaz development evidence

15 October 2026; macOS arm64; Node v24.19.0; local MongoDB 8.2.6.

| Check | Observed |
| --- | --- |
| Standalone access tests | 20 passed, 0 failed |
| Combined default suite | 410 passed, 0 failed |
| Additional real-service integration suite | 21 passed, 0 failed |
| Access fixture behavior | 37/37 expected access actions |
| Seeded documents / quarantined | 10 / 2 |
| Local access p50 / p95 | 0.430 ms / 1.915 ms |
| Classifier fp32 warm p50 / p95 | 10.44 ms / 11.97 ms |
| Classifier local int8 warm p50 / p95 | 6.35 ms / 7.96 ms |

Access fixtures use real local MongoDB with simulated provider and explicitly injected pass-through scanner callbacks. The HR employee-master case verifies access only; masking behavior is tested separately using a test-only callback. Access timings cover these 37 development paths, excluding Mongo startup, actual provider/network time, real detectors, and human approval wait. They are not full gateway overhead or final frozen robustness figures. Classifier percentiles cover short English development prompts, not 512-token windows or Hinglish accuracy.

No real-provider baseline, full-team leak rate, independent held-out accuracy, production privacy claim or full demo readiness is asserted. Raw payloads are never written to these reports. Reproduce with `pnpm test`, `pnpm eval:validate` and optionally `pnpm classifier:spike`.


## HTTP integration evidence

All 37/37 fixtures now pass with real HTTP + JWT + Mongo + the actual detector package and conversation vault. The provider is explicitly simulated. Local p50/p95: 2.344/4.369 ms, including loopback HTTP and real scanning, excluding actual model/network latency and human approval wait. The older standalone access timings above remain a narrower measurement. These figures are development evidence; no frozen accuracy, real-model leak rate or production overhead claim is made.

The five-value privacy scan of audit, incidents, approval metadata and captured logs passes. The eight required integration boundaries are covered with simulated responses. Reproduce the HTTP report using `pnpm test:integration:report`.

The actual merged gateway now has a tested encrypted approval bridge. Four full-gateway checks use actual source modules and a real loopback HTTP provider fixture; no actual Groq/Ollama model inference is claimed. The 37-case timing report above remains specifically the reference-host development measurement, not the full merged gateway’s frozen overhead.

Latest combined test count includes detector PR #3 merged from main (`7d1e305`): 410 default plus 21 additional integration tests (431 total). Earlier timing JSON and slide counts remain historical measurements, not a new benchmark.
