# Evaluation freeze v2 — 15 October 2026

`eval-freeze-v2` points to **05d1afc5cda7309edbc7c733aaca42353128788f**. The annotated tag was created at **17:02:11 IST / 11:32:11 UTC**, after PR #9 merged the reviewed continuation (#7) and classifier follow-up (#8) into main. All three PRs are merged. The original `eval-freeze` at `772a7aff556663a45a8f0904137e0932cd65b177` is preserved for the original Groq reports; its results do not describe the later source changes.

The demo/evaluation setting is `CLASSIFIER_BACKEND=none`. The pretrained fp32 experiment flagged 19/110 benign prompts; int8 is refused by the gateway adapter. Do not tune detectors, access relevance thresholds, policy, corpus, expectations or cases after seeing these runs. Changes affecting decisions need a new versioned freeze and fresh evaluation, never moving an existing tag.

## Install decision

Use **npm**, the root npm workspace and **package-lock.json**:

```sh
npm ci
npm test
npm run test:integration
npm run typecheck
npm run typecheck:access
npm run build --workspace @leakshield/web
```

pnpm-lock.yaml and pnpm-workspace.yaml have been removed. Historical docs/reports can retain old commands as history; current setup and CI use npm. Nested legacy lockfiles do not control the root workspace install. Do not regenerate competing workspace lockfiles.

## Reproduce the frozen real-Groq evaluation

Keep keys private in ignored `.env`; use the selected `openai/gpt-oss-20b` model. Run the temporary protected host on loopback 8180 and the isolated, intentionally unprotected synthetic baseline on 8181:

```sh
VALIDATION_PORT=8180 npm run rehearse:groq
VALIDATION_PORT=8181 node --import tsx tools/validation-host.ts --baseline
```

In separate terminals from the unchanged frozen checkout:

```sh
EVAL_FREEZE_TAG=eval-freeze-v2 EVAL_INTERVAL_MS=6500 node eval/run.mjs eval/heldout.jsonl eval/robustness.jsonl --gateway http://127.0.0.1:8180 --out results/freeze-v2-groq
EVAL_FREEZE_TAG=eval-freeze-v2 EVAL_INTERVAL_MS=6500 node eval/run.mjs eval/heldout.jsonl --gateway http://127.0.0.1:8181 --baseline --out results/freeze-v2-groq
LEAKSHIELD_FREEZE_TAG=eval-freeze-v2 node --import tsx packages/detectors/scripts/misses.ts eval/heldout.jsonl eval/robustness.jsonl --corpus seed/corpus.js --out results/freeze-v2-groq/detector-misses.md
```

The evaluator validates tag ancestry and matching decision/scoring files before marking provenance frozen. Reports include model/provider, source revision, dataset hashes, original expectations and the versioned attachment/local-provider contract. Only metadata is written. Measured-stage overhead excludes model time and uninstrumented audit/vault setup; wall time includes HTTP/model work and any request-level retry. Intentional between-request quota pacing is outside the final-request timer.

The baseline deliberately removes protections and is loopback-only, temporary, and synthetic. It is not a deployable mode. Keep old results unchanged and distinguish gateway intervention metrics from detector-only injection recall. See results/freeze-v2-groq and LIMITATIONS.md for observed numbers and failures.
