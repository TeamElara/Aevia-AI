# Gateway classifier decision

Source: `results/alwaz/classifier-spike.json` and `docs/CLASSIFIER-DECISION.md`, recorded on Node 24.19.0, macOS arm64. These are Alwaz's machine measurements on six authored development prompts, not Windows gateway measurements or held-out accuracy.

| Backend | Warm p50 | Warm p95 | Decision |
| --- | --- | --- | --- |
| Node ONNX fp32 | 10.44 ms | 11.97 ms | Optional gateway backend |
| Locally generated int8 | 6.35 ms | 7.96 ms | Do not enable: recorded attack examples returned SAFE |
| Python sidecar | — | — | Not needed after fp32 Node feasibility success |

Loading an int8 artifact is not evidence that it preserves the classifier's behavior. The recorded q8 observations classify all six examples as SAFE, including the three attack examples that fp32 classifies as INJECTION. No int8 runtime switch is exposed until this discrepancy is investigated and independently validated.

Set `CLASSIFIER_BACKEND=node` to load the pinned full-precision local classifier. Default is `none` so a clean gateway does not silently download a large model or claim unmeasured classification behavior. Install root dependencies first; model files cache under `.cache/classifier` and are ignored. Initial model download requires network access.

The adapter uses Ojaswi's `shouldRunClassifier`, windowing, `classifyInjection`, and combined rule findings. Only new user prompts are classified, once per input; history, retrieved documents, trusted instructions, final payload repeats and responses use the detector rules without rerunning the classifier. Rule-blocked prompts skip model inference. Classifier failure, oversized token windows, invalid scores or timeout stop processing. Retrieved-document classification remains ingest-time work.

The adapter has deterministic integration checks with an injected classifier backend. Real fp32 inference on this Windows host is still unverified. No Hinglish, jailbreak, latency or held-out accuracy guarantee follows from the six-prompt spike.
