# Classifier feasibility decision — 15 October 2026

Decision: Node ONNX is feasible on this machine. Keep it optional for the detector team; use full precision by default because it loads directly from the pinned upstream artifact. A FastAPI sidecar is unnecessary after Node success. No Hinglish, jailbreak or held-out accuracy claim is made.

Model: `protectai/deberta-v3-base-prompt-injection-v2`, Apache-2.0, revision `90c9989b1a342275dd0d1a95aad283c04e075671`. Source and license: https://huggingface.co/protectai/deberta-v3-base-prompt-injection-v2 . This is an English SAFE/INJECTION classifier. Preserve model attribution when redistributing artifacts.

`tools/classifier-spike.mjs` ran full-precision Node CPU inference, then attempted upstream q8. Upstream has no quantized ONNX file, so that attempt failed. `tools/quantize-classifier.py` then generated a local int8 model using ONNX Runtime dynamic QInt8 quantization; the same Node spike loaded that local cached artifact successfully. Both modes ran six authored development prompts over three rounds, with round one excluded from warm percentiles. Six prompts do not establish accuracy or long-window latency. The observations and warm percentiles are saved in results/alwaz/classifier-spike.json. Full precision used about 713 MB of cached files; the locally quantized ONNX file was 243,876,983 bytes. Process RSS was measured in one reused process and must not be interpreted as an isolated fp32-versus-int8 memory comparison.

The optional adapter is `retrieval/classifier.js`; ingestion accepts its classify callback via `ingestWithClassifier`. It refuses to truncate over-512-token chunks silently. The detector team's runtime user-prompt sliding windows and rule-first skip remain their integration responsibility. Do not classify retrieved chunks again during requests.

Reproduce: `pnpm classifier:spike`. For int8, install Python `onnx` and `onnxruntime`, run `python tools/quantize-classifier.py`, then rerun the spike. Weights and generated ONNX files are ignored, not committed. A clean clone runs the upstream fp32 path; q8 is available only after local quantization.
