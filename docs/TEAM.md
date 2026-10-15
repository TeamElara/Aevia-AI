# LeakShield v3: Team Split

How the work in [PLAN.md](PLAN.md) is divided among Arihant, Mahatva, Ojaswi and Alwaz. Section numbers below refer to the plan.

Each person gets about the same amount of work in each tier: about 13–14 hours of Essential + Main work, about 3 hours of Next/Stretch work that is cut first, and about 5 hours in the presentation phase. Totals land between 21.5 and 23 hours each. All hour figures are estimates for AI-assisted coding. Swap roles if someone's skills fit another role better. The workload stays balanced as long as whole roles are swapped.

---

## 1. Roles

| Person | Role | Owns (folder) | Accountable for |
| --- | --- | --- | --- |
| **Mahatva** | Request lifecycle | `apps/gateway` (pipeline, provider, vault, policy, audit, `/v1`) | End-to-end behaviour; nothing leaves the gateway unchecked |
| **Ojaswi** | Detection | `packages/detectors` | Precision and recall |
| **Alwaz** | Access + approvals | `apps/gateway/src/retrieval`, `apps/gateway/src/approvals`, `seed/`, `tests/security` | Zero unauthorised chunks; approvals |
| **Arihant** | UI + evidence | `apps/web`, `eval/`, `extension/` | The demo and the numbers behind it |

**Changes from the plan's section 9 owners (to balance the load):**

- The eval runner and baseline mode move from A (Mahatva) to D (Arihant). Arihant also builds the Eval view in the UI, which uses this runner.
- The audit store, logger filter and SSE emitter move back from D to A (Mahatva), to make up for the runner moving away.
- Eval cases are split among the three non-detection people by area. Ojaswi never sees the held-out or robustness files before the hour-15 freeze.

---

## 2. Workload balance

| Person | Essential + Main | Next + Stretch (cut first) | Presentation (15–21) | Total |
| --- | --- | --- | --- | --- |
| Mahatva | 14.0 h | 3.0 h | 5.5 h | 22.5 h |
| Ojaswi | 13.5 h | 2.5 h | 5.5 h | 21.5 h |
| Alwaz | 14.5 h | 2.5 h | 6.0 h | 23.0 h |
| Arihant | 13.0 h | 4.5 h | 4.5 h | 22.0 h |

Hours 21–24 (rehearsals, bug fixes) are shared and not counted.

---

## 3. Task lists

Tier: **E** = Essential, **M** = Main presentation, **N** = Next, **S** = Stretch.

### Mahatva: Request lifecycle

| Task | Tier | Est. |
| --- | --- | --- |
| Repo setup: TS + `tsx`, `docker-compose.yml` with Mongo, first draft of `types.ts` | E | (hour 0) |
| Pass-through gateway, JWT check middleware, Groq adapter with call counter and payload capture (eval mode) | E | 2 h |
| Policy engine: `policy.yaml` + `zod` + hot reload, strictest action wins (§7) | E | 1.5 h |
| Conversation vault: random `[CATEGORY_XXXX]` tokens, 30-min TTL, exact restore with origin rules (§6) | E | 2.5 h |
| Final outbound scan over the whole assembled payload (§5) | E | 1.5 h |
| Response pipeline: detect, restore, sanitise links, in that order; buffered | E | 1.5 h |
| Audit store (allowlist, HMAC `user_pseudo`, TTL index), logger redaction filter, SSE emitter (§8) | E | 2.5 h |
| Ollama pulled by hour 2; fallback tested end to end by hour 12 | M | 1 h |
| Eval cases: normal work (12) + sensitive disclosure (12) held-out, 7 dev | E | 1.5 h |
| `/v1/chat/completions`: non-stream first, then `stream: true`; API key mapped to a user | N | 2 h |
| Hardening: provider timeouts, 429 retry, fail-closed scanner | N | 1 h |
| **15–17:** run held-out + baseline on the frozen tag | — | 2 h |
| **17–19:** README, `.env.example`, clean-clone test on a second laptop | — | 2 h |
| **19–21:** record the backup video | — | 1.5 h |

### Ojaswi: Detection

| Task | Tier | Est. |
| --- | --- | --- |
| Agree the `Finding` contract and the detector signature `(text, ctx) => Finding[]` | E | (hour 0) |
| Aadhaar (Verhoeff + context/4-4-4), VID, PAN, phone, cards (Luhn + IIN), IFSC, UPI, bank account (§5) | E | 2.5 h |
| Secrets (~20 gitleaks formats) + last-3-messages joined scan | E | 1.5 h |
| Response detectors + canary check | E | 1.5 h |
| Privacy test in Vitest: 5 seeded values, 0 hits in audit, incidents, approvals, logs (§8) | E | 1 h |
| Normaliser: NFKC, zero-width, homoglyphs, leetspeak, digit joining, offset map | M | 2 h |
| Injection rules: intent × target, Hinglish, structural tells, cross-user, damping, scoring | M | 3 h |
| Tune thresholds on the **dev set only**; tag `eval-freeze` at hour 15 | M | 2 h |
| Classifier integration, only if Alwaz's spike passed | N | 1.5 h |
| base64 / hex / URL decoding, one level | N | 1 h |
| **15–17:** misses analysis per category (after freeze) | — | 2 h |
| **17–19:** limitations page + DPDP Act 2023 slide (check section numbers in the Act) | — | 2 h |
| **19–21:** metrics + misses slides; demo narrator | — | 1.5 h |

### Alwaz: Access + approvals

| Task | Tier | Est. |
| --- | --- | --- |
| Hour 0: check Groq retention settings + rate limits in the team account; write them down for Q&A | E | (hour 0) |
| Corpus of 10 synthetic docs incl. 2 poisoned, seed script, users `asha`, `ravi`, `meera`, `ceo`, `admin`, JWT issuing (§7) | E | 2.5 h |
| ACL retrieval (groups + per-user grants) inside the Mongo query, recheck at assembly, `external_llm` flags | E | 2 h |
| **Classifier spike** at hours 1–3: Node ONNX, then int8, then sidecar. Record the decision | E | 1.5 h |
| Ingest scanner (comments, `display:none`, white text, zero-width, alt/title), chunk injection scores, quarantine | E | 3 h |
| Security integration tests (the 8 checks in §10) | E | 2.5 h |
| Shingle fingerprints of restricted docs | M | 1.5 h |
| Eval cases: authorised RAG (6), unauthorised retrieval (6), indirect injection (4) held-out, 6 dev; 15 paraphrase mutations | E | 1.5 h |
| Approval queue backend: AES-GCM in memory, 10-min expiry, metadata-only Mongo record, hash-checked replay (§7) | N | 2.5 h |
| **15–17:** robustness run + p50/p95 overhead on demo hardware | — | 2 h |
| **17–19:** architecture diagram + results tables | — | 2 h |
| **19–21:** lead the 8-slide deck | — | 2 h |

### Arihant: UI + evidence

| Task | Tier | Est. |
| --- | --- | --- |
| Hour 0: Vite + React + Tailwind scaffold; start collecting the 20 dev cases from the others | E | (hour 0) |
| Chat shell + user switcher, calling the real gateway from hour 3 | E | 2 h |
| Eval runner (`eval.ts`): JSONL in, JSON + Markdown reports out, payload-capture booleans, baseline mode (§10) | E | 3 h |
| Action badge, reason, latency strip, "Sent to model" payload + provider-call count | M | 2 h |
| Live incidents (SSE) + overview charts | M | 2.5 h |
| Eval view: 10-case live run button + frozen report + baseline table | M | 1 h |
| Eval cases: legit security (6), benign lookalikes (6), direct injection (8) held-out, 7 dev; 15 Hinglish mutations; mutation script for the 30 mechanical ones; pick the 10-case live subset | E | 2.5 h |
| Approvals UI: pending list, countdown, approve/reject | N | 1 h |
| "Replace with [SECRET_…] and send" button | N | 0.5 h |
| Chrome extension for chatgpt.com, only after the hour-12 gate (12:00–16:00); **killed at 17:00** if not demo-stable | S | 3 h |
| **16–17:** load the frozen report + baseline table into the Eval view | — | 1 h |
| **17–19:** demo script; the `/v1` SDK script as the extension fallback | — | 2 h |
| **19–21:** demo driver for both rehearsals | — | 1.5 h |

---

## 4. Hour-by-hour

| Hours | Mahatva | Ojaswi | Alwaz | Arihant | Gate |
| --- | --- | --- | --- | --- | --- |
| 0–1 | Repo, compose, `types.ts` | `Finding` + detector interface | Groq retention + rate limits | Web scaffold; dev-case template | Contracts merged |
| 1–3 | Gateway, JWT check, Groq adapter + counter, Ollama pull | Aadhaar/PAN/phone/card + secrets | Corpus, seed, users, ACL query; classifier spike | Chat shell wired to gateway; dev cases | UI → gateway → Groq → UI; audit row; classifier decision |
| 3–6 | Policy engine, vault + restore, outbound scan, buffered output | Normaliser, injection rules + Hinglish, multi-message scan, IFSC/UPI/bank | Ingest scanner, chunk scores, quarantine, shingles | Badges, "Sent to model", latency strip; held-out slice | **Scenario 1:** Aadhaar masked + restored over 2 turns; secret = 0 calls |
| 6–9 | Response pipeline, audit store, logger filter, SSE | Response detectors, canary, classifier (if passed), privacy test | RAG into pipeline (with Mahatva), `external_llm`, security tests | Incidents + overview, eval runner on dev | **Essential tier; 3 scenarios end to end** |
| 9–12 | Non-stream `/v1`, Ollama fallback | Tune on dev only | Approval backend; paraphrase mutations | Baseline mode, approvals UI, mutation script, Hinglish mutations, live subset | **Main presentation tier** |
| 12–15 | `/v1` streaming, hardening (timeouts, 429 retry) | base64 decoding, fail-closed checks | Approval end to end with UI; clean-clone test | Replace-and-send button, then extension (if gate 12 passed) | Clean-clone `docker compose up` works |
| 15 | | **Tag `eval-freeze`** | | | Tag committed |
| 15–17 | Held-out + baseline runs | Misses per category | Robustness run, p50/p95 | Extension until 16:00; frozen report into Eval view; **kill decision at 17:00** | `results/` committed |
| 17–19 | README, `.env.example` | Limitations, DPDP slide | Architecture diagram, results tables | Demo script, `/v1` SDK script | README-only start works |
| 19–21 | Backup video | Metrics slides; narrator | Deck lead | Demo driver | Demo ≤ 5:00 |
| 21–24 | All: rehearsal ×3, bug fixes in own area only | | | | No new features |

---

## 5. Hand-offs

Agree these interfaces in hour 0 and build against stubs until the real version lands.

| From → To | Interface | Needed by |
| --- | --- | --- |
| Ojaswi → Mahatva | `detectAll(text, ctx): Finding[]` from `packages/detectors` | Hour 3 (stub at 1) |
| Alwaz → Mahatva | `retrieve(user, query): Chunk[]` with ACL applied; `chunk.injection_score`, `external_llm` | Hour 6 |
| Alwaz → Mahatva | `approvals.enqueue(payload, ctx)` / `approvals.approve(id)` | Hour 12 |
| Mahatva → Arihant | Chat API response: `answer, action, reason, findings, stage_ms, sent_to_model, provider_calls` | Hour 3 |
| Mahatva → Arihant | SSE `/events` stream of `AuditEvent` | Hour 9 |
| Mahatva → Arihant | Eval mode: provider call counter + captured payload per request | Hour 9 |
| Mahatva → Arihant | `POST /v1/scan` for the extension | Hour 12 |
| Mahatva, Alwaz, Arihant → Arihant | Eval cases in `eval/*.jsonl` (format in §10) | Dev by hour 3; held-out by hour 9 |

---

## 6. Ground rules

- **Each person works in the folder they own.** Changes in someone else's folder go through that person.
- **Merge to `main` at least every 2 hours.** Use branches like `mahatva/vault` or `ojaswi/injection`.
- **Ojaswi does not open `eval/heldout.jsonl`, `eval/robustness.jsonl` or `eval/live_subset.jsonl` before the hour-15 freeze.** Only the dev set is used for tuning.
- **Missed gate:** stop, cut from the list in §12 in order, then start the next slot. The person whose task is cut moves to help whoever is blocking the gate.
- **After hour 21:** bug fixes only, each person in their own area.
