# Final UI evidence — 15 October 2026

Alwaz's post-merge console check passed on main **`0c560db7e2671d024a3f773b89fe34703e353ffc`**, after ReDoS hotfix [#25](https://github.com/TeamElara/Aevia-AI/pull/25), reports #26–#29, limitations #24 and Halo UI [#31](https://github.com/TeamElara/Aevia-AI/pull/31). The canonical deck and README now show this UI. No gateway decision code, web source, policy, evaluation case or frozen result changed in the screenshot/documentation update.

## Environment and observed flow

Apple M3, Node 24.19.0, npm 11, independent persistent MongoDB 8.0.16, the normal production gateway and Vite console in **live** mode. Dedicated loopback ports were Mongo 27029, gateway 8090 and console 5180, with matching CORS/proxy configuration. The ordinary seed command produced **10 documents, 10 chunks and 2 quarantined sources**. Private configuration remained ignored and was not included in the screenshots or Git changes.

The configured provider was real Groq **`openai/gpt-oss-120b`**, classifier `none`, baseline disabled. This post-freeze smoke check does **not** reuse the frozen evaluation's 20b model and must not be described as the same-model evaluation. It does not replace, rerun or change the v1/v2 results.

At approximately 21:51–21:55 IST, the actual browser displayed:

| Transition | Observed evidence |
| --- | --- |
| Meera submits the Garuda starter already in DEMO.md | Waiting for admin approval, pending badge, **0 model calls** |
| Open menu → Approvals | One Garuda request, matching metadata/hash and an **Approve** control |
| Admin approval through that control | Gateway policy/ACL recheck and replay success message, empty pending queue, approved history |
| Return to the original Chat without changing identity | Nonempty roadmap answer, **Allowed**, **1 model call** |

The Approvals view obtains its own admin session. The Chat identity stays Meera throughout; switching the avatar or starting a new conversation is unnecessary and would discard the scene. The [canonical script](DEMO.md#actual-console-check-after-hotfix-and-halo-ui-merge) contains the exact navigation.

Captures are actual full browser viewports with synthetic data: [pending](screenshots/garuda-pending.jpg), [queue](screenshots/garuda-queue.jpg), [completed](screenshots/garuda-approved.jpg). They contain no credential-bearing terminal or provider-request capture. No failure occurred in this flow, so no Garuda bug issue was filed.

## Verification

- `npm ci`: successful install from the root lockfile, zero vulnerabilities reported at installation.
- Final source: **498 unit/security/component tests passed**. The integrated backend's **54 integration tests passed**, for **552 total**. These automated integration tests use a simulated LLM HTTP provider; the browser flow above used real Groq.
- Gateway/access type checks, web lint and production build passed. Final owner UI commit `f05fa27` also has successful [Gateway CI](https://github.com/TeamElara/Aevia-AI/actions/runs/38767111713) and [access-security CI](https://github.com/TeamElara/Aevia-AI/actions/runs/38767111718).
- Dataset shape validation passes. Frozen files/tag are unchanged by this documentation/deck update.
- The eight-slide PPTX is package/layout/font validated, rendered, and checked for the preserved cover, exact first-freeze footnote and native metrics tables. The approval screenshots are on slide 4; slide 5 remains frozen 20b evidence.

Two verification caveats remain visible: one busy CI run measured 52.78 ms against the 50 ms structural-line benchmark before an unchanged rerun passed; this is not a universal latency SLA. A local audit-privacy assertion also once matched a short numeric fixture substring inside a timing measurement rather than leaked PII; inspection found no raw identifier, and an unchanged rerun passed. Neither observation was hidden by changing code or test limits.

## Team handoff

Mahatva separately reports **552 passing tests and two 21/21 real-Groq checks on the prepared Windows demo laptop** in [PR #34](https://github.com/TeamElara/Aevia-AI/pull/34), against the same main revision. That is teammate evidence awaiting its own review, distinct from this Mac browser check.

A timed joint rehearsal still needs the actual driver/narrator, Arihant and Ojaswi. **Mahatva owns the backup video**: the verified existing recording predates Halo and should be replaced or checked against the merged UI. No new recording, joint elapsed time, projector test or participant attendance is claimed here. Blind v3 and delegation work remain outside this final screenshot/documentation task.
