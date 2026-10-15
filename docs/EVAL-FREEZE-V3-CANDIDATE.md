# eval-freeze-v3: candidate and checklist

Status: **candidate, not frozen.** Branch `ojaswi/detection-v3`. This follows `docs/HELDOUT-V3-PROTOCOL.md`: after the final demo, the team agrees the v3 contract, freezes it, and only then reveals and runs the blind held-out v3 set once. `eval-freeze` and `eval-freeze-v2` and their results stay as they are. Detection (Ojaswi) has not seen the v3 cases and does not run them.

## What the candidate changes

| Area | Change | Owner to review |
| --- | --- | --- |
| Detectors | Hinglish, Devanagari, mixed-script and roleplay rules. Answer-side injection capped at warn. UPI handles, reserved example emails, placeholder secrets. Voter ID, passport, DL, GSTIN, vehicle, +91 grouping. More secret formats plus an entropy fallback. Emoji and base64-Devanagari normalisation. `\v`/`\f`/NEL role headers | Ojaswi; Mahatva reviews |
| Policy | `apps/gateway/policy.yaml`: `ifsc: warn` → `ifsc: mask`, version `"1"` → `"2"` (`docs/decisions/IFSC-POLICY.md`) | Mahatva |
| Retrieval integration | `apps/gateway/src/retrieval/integration/scanners.ts`: the new PII categories are masked/redacted like the existing ones | Mahatva / Arihant |
| Eval tooling | `eval/dev-v3.jsonl` (52 dev cases), `eval/mutate.mjs` new mutations (default output unchanged), `validate.mjs`, `scripts/mutation-check.ts` | Ojaswi |

Not changed: thresholds (`warn 0.60`, `block 0.85`), the classifier (`CLASSIFIER_BACKEND=none`), the provider and model, the held-out v1/v2 files, and the eval runner's scoring.

Dev-only evidence: `results/ojaswi/detection-v3.md`. The independent post-check (red-team, not used for tuning) is 34/50 stopped, against 32/50 before. Expect the blind number to sit well below the dev number.

## Checklist (team, after the final demo)

1. Agree the contract: this candidate, IFSC mask, provider `openai/gpt-oss-20b`, `CLASSIFIER_BACKEND=none`.
2. Review and merge the `ojaswi/detection-v3` PR. No detector, policy or threshold change after this point.
3. On the merged commit, run the gates:
   ```sh
   npm ci
   npm test
   npm run test:integration
   npm run typecheck
   npm run eval:validate
   ```
4. Tag that commit `eval-freeze-v3` (annotated, never moved). Record the commit and time here.
5. Mahatva verifies the private v3 JSONL against SHA-256 `d13724404e9b5c104f87469e80a0af69396756bd0a645e45e483f941cfd558e2` and then runs it **once** from the tagged checkout:
   ```sh
   EVAL_FREEZE_TAG=eval-freeze-v3 EVAL_INTERVAL_MS=6500 node eval/run.mjs <private heldout-v3.jsonl> --gateway http://127.0.0.1:8180 --out results/freeze-v3-groq
   ```
   Do the same with `--baseline` against the 8181 baseline host, as for v2. Publish only aggregate metrics and per-case ids/booleans.
6. After the run, Detection may read ids and rule ids for a misses analysis. Any rule change made from it needs a new set and a new freeze.
