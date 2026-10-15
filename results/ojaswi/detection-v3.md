# Detection v3: dev-set progress

Ojaswi, branch `ojaswi/detection-v3`. **Dev only**: every number here comes from `eval/dev.jsonl` (20 cases) and `eval/dev-v3.jsonl` (52 cases, synthetic). No held-out, robustness or live-subset case was opened. `eval-freeze-v2` is unchanged, and the final demo runs on v2. Case ids only, no prompt text.

Command: `npx tsx scripts/tune.ts ../../eval/dev-v3.jsonl` in `packages/detectors`. Injection is counted at 0.85 (block); false alarms at 0.6 (warn).

| Step | Attacks caught (of 28) | Injection false alarms (of 24 allowed) | Data flagged in allowed cases | Old dev set (20) |
| --- | --- | --- | --- | --- |
| Baseline (v2 rules + ReDoS hotfix #30) | 10 | 6 | 4 (D-147 UPI, D-148 EMAIL, D-149/D-150 SECRET) | 4/4 caught, 0 false |
| 2. Hinglish, Devanagari, mixed-script and roleplay rules | 28 | 1 (D-146, answer-side, step 3) | 4 (step 3) | 4/4 caught, 0 false |
| 3. Root causes H-003, H-030, H-041, H-043, H-045 | 28 | 1 at warn only (D-146: answer-side injection now 0.70, answer delivered and logged, not blocked) | 0 | 4/4 caught, 0 false |
| 4. Indian PII: Voter ID, passport, DL, GSTIN (checksum), vehicle, +91 3-3-4, UPI handles | 28 | 1 at warn only | 0 | 4/4 caught, 0 false |

Step 4 benign check: 110 benign prompts + 10 seed documents give 0 hits in the new categories. `test/indian-pii-v3.test.ts` has a hit and a benign lookalike for each category.
| 5. Secrets: Stripe test/webhook, Slack app, GCP service account, Azure SAS/SharedAccessKey/SQL password, JDBC, more DB URLs, entropy fallback | 28 | 1 at warn only | 0 | 4/4 caught, 0 false (also with `--corpus`) |

Step 5 benign check: the entropy fallback gives 0 hits on the 110 benign prompts and 10 seed documents. `test/secrets-v3.test.ts` has 19 formats and 12 lookalikes: hashes, UUIDs, base64 text, docs URLs, placeholders, and a random id without key context.
| 6. Mutations (leet, fullwidth, zero-width, ROT13, emoji) + normaliser fixes | 28 | 1 at warn only | 0 | 4/4 caught, 0 false |

Step 6, mutation retention on dev (`results/ojaswi/mutation-check-v3.md`): all 31 caught dev attacks survive every mutation. Before the normaliser fixes, emoji spacing kept only 4/28 dev-v3 attacks and base64 lost all 8 Devanagari ones. Each mutation leaves the 29 clean allowed cases clean. One known gap: in base64, a payment record still masks but reports one category per decoded block.
| 7. Role headers after \v, \f, NEL (Arihant's report) | 28 | 1 at warn only | 0 | 4/4 caught, 0 false |
