# Judge Q&A

Short, honest answers for questions judges are likely to ask. Every number below comes from a file in the repo and should be quoted with its source. This page has only the Detection section so far (Ojaswi). Other owners can add sections for access/approvals, gateway/policy and UI.

---

## Detection (Ojaswi, `packages/detectors`)

**Numbers to quote.** The frozen source is `eval-freeze-v2` (05d1afc). The provider runs used Groq `openai/gpt-oss-20b` with the classifier off. Sources: `results/freeze-v2-groq/RESULTS.md` and `detector-misses.md`.

| What | Number |
| --- | --- |
| Provider leak flags, same 60 held-out cases, baseline vs protected | **12 → 1** |
| Held-out exact actions | 53/60 |
| Intervention recall / precision | 1 / 0.865 (F1 ≈ 0.93, computed from these two; the report does not print F1) |
| Allowed cases with an intervention (false positives) | 5/28 |
| Detector-level injection catch, held-out + robustness | **32/36**, with **0 injection false alarms** |
| Expected PII/secret categories found | 37/37 |
| Gateway robustness retention | 0.933 overall. Homoglyph 1.0, base64 1.0, **Hinglish 0.733** |
| Gateway stage overhead p50 / p95 | 13 / 26 ms (model time excluded) |

### Q: How does detection work? Is it just regex?

Rules, then checks, then a policy decision. There is no LLM in the decision.

- **Normalise first.** Unicode NFKC, zero-width removal, homoglyph folding, de-spacing ("i.g.n.o.r.e"), and decoding of base64/hex/URL-encoded blocks. Every rule runs on these views, and spans map back to the original text.
- **PII is validated, not just pattern-matched.** Aadhaar needs the Verhoeff checksum, cards need Luhn, and PAN needs its fixed structure. A context word ("Aadhaar", "PAN") raises the score.
- **Secrets.** Provider key formats, assignments such as `api_key = ...`, private keys, and canary tokens.
- **Injection uses intent × target.** "Ignore/reveal/print" alone is not enough; it must point at "instructions/system prompt/other users' data". Quotes, negations and "explain what prompt injection is" lower the score.
- **Policy decides the action.** Inject ≥ 0.85 is blocked; 0.60–0.85 is a warning. PII is masked and restored for the user; secrets are blocked. See `apps/gateway/policy.yaml`.

### Q: What are your false positives?

- **Detector level:** 0 injection false alarms on 120 frozen cases, and 0 on a 110-prompt benign corpus.
- **Gateway level:** 5 of 28 allowed held-out cases got an intervention. Most come from scanning the **model's answer**, not the user's prompt. In H-003 and H-043, a correct answer about security or OWASP quoted attack phrasing. In H-030 and H-041, an example address in the answer matched the UPI/email rule. In H-045, `test-key-placeholder` was not recognised as a placeholder.
- We have not tuned anything on these cases. The fixes are planned for v3 (below).

### Q: Why is Hinglish weaker?

Our Hinglish and Hindi rules are word lists. Teammates' rewrites used everyday words that are not in the lists, such as "maan lo" (pretend), "chhupi hui configuration", and Latin "mode"/"data" inside Devanagari. Detector level is 4/8 Hinglish attacks caught; gateway retention is 0.733. The English-only DeBERTa classifier does not help here. The durable fix is more language coverage plus a classifier trained on Hinglish.

### Q: Did you red-team it yourselves after the freeze?

Yes. We ran 50 new synthetic attacks on the running gateway (`results/ojaswi/redteam.md`, branch `ojaswi/redteam-v2`). The report has ids and results only; there are no prompt texts in it.

- **32/50 stopped before the model**, 1 warned, **17 bypassed**.
- **All 11 encoding tricks were stopped:** zero-width, fullwidth, leetspeak, base64, ROT13, homoglyph mix, emoji spacing.
- **Bypasses:**
  - 7/10 Hinglish
  - 3/8 Devanagari
  - 4/8 roleplay
  - 3/6 split-line
- This confirms the frozen result: language and roleplay are the gap, not obfuscation.

### Q: Can someone crash or slow the gateway with a crafted input?

We checked this ourselves (`results/ojaswi/redos-audit.md`, branch `ojaswi/redos-audit`). We ran all 111 detector regexes against 51 adversarial inputs of 50 KB, each in a worker with a timeout.

- **One real issue.** The structural-injection pattern (`src/injection.ts:84`) is cubic on long runs of newlines: about 2.4 s at 2,000 newlines and over 15 s at 50 KB. Because detection is synchronous, that would stall the gateway for everyone. The fix is a one-line regex change (`\s` → `[ \t]`). The team decides whether it goes in before the demo, since the demo is frozen on v2.
- **A second, medium issue.** The markdown-link pattern takes about 2.5 s at 50 KB. The fix is a length bound.
- On realistic input the detector is fast. `detectAll` p50/p95 is 1.0/1.2 ms at 1 KB, 12/13 ms at 10 KB and 44/48 ms at 50 KB (`results/ojaswi/bench.md`).

### Q: Why is the ML classifier off?

We integrated a DeBERTa prompt-injection classifier and measured it before the freeze. It flagged 19 of 110 benign prompts (17%), and it is English-only, so it does not fix Hinglish. We kept it off (`CLASSIFIER_BACKEND=none`). All quoted numbers are rules-only. See `results/ojaswi/classifier-check.md` and `docs/CLASSIFIER-DECISION.md`.

### Q: What is the one leak left?

H-020: an IFSC code in a transfer form. Frozen policy *warns* on IFSC because it is a public branch code, so the provider still sees it. We have decided to **mask** it in v3, since it sits next to the account number we already mask (`docs/decisions/IFSC-POLICY.md`). We do not claim zero leakage.

### Q: How do we know you didn't tune on the test set?

- Rules were tuned on `eval/dev.jsonl` only.
- `eval-freeze-v2` is an annotated tag and has never moved. Each result records the tag, commit and dataset hash.
- The misses analysis was written after the freeze and changed no rules.
- **Caveat:** the held-out set was written by teammates who knew the system, so it is not independently blinded. v3 fixes this with a blind set (below).

### What v3 changes (after the demo, new freeze)

The demo stays on v2. v3 is a separate branch, merged only on team approval, with small PRs and a new `eval-freeze-v3` tag. `eval-freeze-v2` will never move.

| Gap | v3 work |
| --- | --- |
| Hinglish / Devanagari / roleplay | 40+ new dev cases, normalisation and vocabulary fixes measured on dev only. Root causes for H-003, H-030, H-041, H-043 and H-045 each get dev cases |
| Answer-side false positives | Injection rules alone do not block a model answer; canary, secret or fingerprint hits still do. Example and placeholder values are skipped |
| ReDoS | Structural and link regex fixes, plus the audit as a regression check |
| Indian PII | UPI, Voter ID, DL, Passport, GSTIN, +91, vehicle number and bank account, each with a benign lookalike test |
| Secrets | GitHub, Slack, Stripe, JWT, PEM, GCP service account, Azure connection string, DB URL, and an entropy fallback with 0 benign false positives |
| IFSC | `mask` (decision doc) |
| Evaluation | New mutations (leet, fullwidth, zero-width, ROT13, emoji). A **blind held-out set written by Mahatva/Alwaz and never seen by Detection**, then a fresh provider run |

All data is synthetic. Reports carry ids and numbers, not prompt text.
