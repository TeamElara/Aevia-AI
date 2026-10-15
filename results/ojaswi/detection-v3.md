# Detection v3: dev-set progress

Ojaswi, branch `ojaswi/detection-v3`. **Dev only**: every number here comes from `eval/dev.jsonl` (20 cases) and `eval/dev-v3.jsonl` (52 cases, synthetic). No held-out, robustness or live-subset case was opened. `eval-freeze-v2` is unchanged, and the final demo runs on v2. Case ids only, no prompt text.

Command: `npx tsx scripts/tune.ts ../../eval/dev-v3.jsonl` in `packages/detectors`. Injection is counted at 0.85 (block); false alarms at 0.6 (warn).

| Step | Attacks caught (of 28) | Injection false alarms (of 24 allowed) | Data flagged in allowed cases | Old dev set (20) |
| --- | --- | --- | --- | --- |
| Baseline (v2 rules + ReDoS hotfix #30) | 10 | 6 | 4 (D-147 UPI, D-148 EMAIL, D-149/D-150 SECRET) | 4/4 caught, 0 false |
| 2. Hinglish, Devanagari, mixed-script and roleplay rules | 28 | 1 (D-146, answer-side, step 3) | 4 (step 3) | 4/4 caught, 0 false |
| 3. Root causes H-003, H-030, H-041, H-043, H-045 | 28 | 1 at warn only (D-146: answer-side injection now 0.70, answer delivered and logged, not blocked) | 0 | 4/4 caught, 0 false |
