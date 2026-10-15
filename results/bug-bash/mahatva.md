# Bug bash: mahatva
- Commit: `f8fc43dac44e338d4a55264dd1d9751b86085003` — Merge pull request #39 from TeamElara/arihant/upload-ui
- Mode: B (simulated external-policy HTTP provider; no cloud calls or answer-quality claims).
- OS / browser: Windows, Node v26.3.0, npm 11.16.0 / Codex in-app browser.
- Checks run: A1, A2, A3, A4, A5, A6, A7, A8, F3, F4; B1, B2, B3 sanity checks. A9 reviewed and not applicable (Mode A-only).
- Results: **12 checks passed, 1 setup/documentation issue, 1 not applicable**. All 34 API assertions passed. Both browser live-subset runs completed 10/10; these are simulated smoke results, not new model-backed benchmark numbers.
- Severity counts: **P0: 0; P1: 0; P2: 1; P3: 0**. No additional independently reproduced bugs were found in this assigned scope; there are not three confirmed bugs to rank.
- Scope: fresh clone; no application code or tracked configuration edits. Separate unfinished delegation work in the parent checkout is excluded. Only this report and screenshots are committed.
- Guide provenance: read all of `docs/BUG-BASH.md` from `origin/arihant/bug-bash` at `87e05cf17aa6951622813913404274724f2457c6` (PR #40), because the guide is absent from tested main. PR #40 was still open at the final status check. Runtime remained pinned to the main revision above throughout.

## BB-mahatva-01: Bug-bash guide is missing from main
- Check: A1
- Severity: P2
- Steps:
  1. Clone `https://github.com/TeamElara/Aevia-AI.git` into a new folder and check out `main` at `f8fc43d`.
  2. Read `docs/BUG-BASH.md` as required by the supplied test prompt.
  3. Repeat the file check against the same clean checkout/git tree.
- Expected: The guide required for fresh-main setup and assigned checks exists on main.
- Actual: The file is absent. The guide exists only on `origin/arihant/bug-bash`, in open PR #40, at the time of setup.
- Evidence: PowerShell `Get-Content docs/BUG-BASH.md` reports `Cannot find path ... because it does not exist`; `git ls-tree -r HEAD docs` contains no `BUG-BASH.md`.
- Flaky: no (three independent file/tree checks of the pinned clean main revision).

## Environment notes
- `npm ci` completed: 462 packages added, 0 reported vulnerabilities. The first sandbox-restricted attempt was interrupted and retried with registry access; this is an agent-environment restriction, not a project defect.
- The guide's exact `npm run demo:gateway` startup encountered `Error: listen EADDRINUSE: address already in use 127.0.0.1:8080`, because the existing prepared demo owns that port. This is an environment constraint, not counted as a project bug. The existing demo was not stopped.
- The user explicitly approved isolated ports **8086/5176**. An outside-checkout test harness called the existing, unmodified exported `startGatewayDemo(8086, { corsOrigin: 'http://localhost:5176' })`. The console used the existing `GATEWAY_URL` runtime environment option and `--port 5176 --strictPort`; no repository config file was edited. Both processes ran only against the temporary Mode B database.
- Hand-entered synthetic values were the guide's Aadhaar `2345 6789 0124`, PAN `ABCPE1234F` and AWS fixture `AKIAIOSFODNN7EXAMPLE`, and its provided prompts. F4 used the shipped live-subset button/dataset as assigned, without changing or introducing fixture values. No `.env`, credential, JWT or API key was copied into evidence.

## Check details and evidence

| Check | Result | Observed behavior / variations |
| --- | --- | --- |
| A1 | Issue above; remaining Mode B setup passed | Fresh clone and lockfile install succeeded. Approved isolated startup worked; console showed `simulated provider`. |
| A2 | Pass | `/health` returned 200 `{"status":"alive"}`; `/ready` returned 200 `{"status":"ready"}`. |
| A3 | Pass for protected routes | No-token chat, approvals, events, stats, delegations and scan returned 401. A malformed bearer token returned 401. Error bodies had no stack trace/internal paths. `/api/health` and demo login are intentionally public per API contract; the guide's word "any" cannot literally apply to those two endpoints. |
| A4 | Pass | Login with `Origin: http://evil.example`, opaque `null`, and a localhost-lookalike origin returned 403 `ORIGIN_NOT_ALLOWED`. |
| A5 | Pass | Nonstream response was OpenAI-shaped with action `mask`; streaming completed with `[DONE]` and action `mask`. A matching `/api/chat` evaluation capture contained no original PAN in the full provider payload. |
| A6 | Pass | Both the exact scan fixture and its B2 sentence form returned `block` with a `SECRET` finding, without echoing the fixture value. |
| A7 | Pass | 65 bounded requests as one fresh CEO identity: first 60 returned 200; request 61 and the next four returned 429. `Retry-After: 60` was present. |
| A8 | Pass | 31,000-character prompt, malformed JSON, JSON array and an unknown field each returned 400 `INVALID_REQUEST`. Readiness still returned ready afterward. |
| A9 | N/A | The guide restricts this check to Mode A. No Mongo outage/recovery claim is made. |
| B1 | Pass (Mode B scope) | Browser showed Masked, one call and a complete echo. Inspector showed Aadhaar/PAN tokens; full API capture had neither original value. [Screenshot](img/mahatva-b1-masked.png). |
| B2 | Pass | Browser blocked the credential at zero calls; clicking `Replace with [SECRET_…] and send` produced Allowed and a simulated answer with one call. [Screenshot](img/mahatva-b2-replacement.png). |
| B3 | Pass | Exact supplied injection sentence blocked at zero calls in API and browser. |
| F3 | Pass | Browser approve moved the request into Approved history and Meera received the answer at one call. A separate browser reject moved it into Rejected history and Meera received Denied with no answer/zero calls. API variations: second approval 409 `APPROVAL_NOT_PENDING`, wrong hash 409, non-admin approval 403; approved result released to owner and rejected result remained empty. [Screenshot](img/mahatva-f3-approved.png). |
| F4 | Pass | `Run live subset` finished all ten rows, re-enabled `Run again`, and displayed 10/10 correct, 7/7 caught, 0 false positives, 0 declared leaks and recall 1.00. `Run again` also finished 10/10. [Screenshot](img/mahatva-f4-complete.png). |

Browser warn/error log inspection after the core UI checks returned no entries. This is an observation for the tested flow, not a guarantee that every feature has no errors. Acting-posts/attachment checks belong to other assignments and are not claimed here.

## Passed
- A2, A3 (protected routes), A4, A5, A6, A7, A8.
- B1 (masking/transport scope only), B2 including replacement, B3.
- F3 including browser approve/reject and API double-approval/hash/non-admin checks.
- F4 including a second browser run.
- A1's clone/install and isolated Mode B startup passed, but A1 is not marked fully passed because the required main guide was missing.

## Not run / limitations
- A9: not applicable in selected Mode B; no Mongo outage or recovery claim is made.
- No live Groq answer-quality assessment or live-provider resilience check. Mode B intentionally echoes rather than generating prose.
- No original/raw private data used. No evaluation files, frozen metrics, application code or repository configuration changed.
- This report records the pinned main revision; it does not assert that a later main revision still has the missing-guide issue.
