# Bug bash: alwaz
- Commit: `f8fc43d Merge pull request #39 from TeamElara/arihant/upload-ui` (`f8fc43dac44e338d4a55264dd1d9751b86085003`)
- Mode: B (simulated external-policy HTTP provider, temporary real MongoDB; no cloud calls)
- OS / browser: macOS 26.6.1 (25G76), Apple silicon; Codex in-app Chromium browser, default 1280 × 720 viewport
- Runtime: Node 24.19.0, npm 11; fresh standalone clone, default gateway 8080 and console `http://localhost:5173`
- Checks run: A1 (setup observations), A2, B1, B2, B3, B6, B7, B8, B9; C1–C9 attempted, with the lifecycle/time-zone subchecks blocked as detailed below.

Testing stayed on main. No code, configuration, dependency manifest, lockfile, seed, policy or expectation was changed. No `.env` was opened, copied or created. Only this report and screenshots are included. `npm ci` succeeded (463 packages installed, zero reported vulnerabilities). Commands used the installed Node/npm runtime, since npm is not on this Mac's default PATH.

## Scope and setup provenance

`docs/BUG-BASH.md` is missing from tested main. To avoid inventing the checks, I read the **entire** proposed guide using `git show origin/arihant/bug-bash:docs/BUG-BASH.md`, at `87e05cf17aa6951622813913404274724f2457c6` ([PR #40](https://github.com/TeamElara/Aevia-AI/pull/40), open throughout this run). This supplied the acceptance criteria and report format only. I did **not** check out that branch, cherry-pick it, merge it, or apply its Mode B wiring change. The guide's absence and the Mode B failure below are known pending-PR issues, not discoveries of a new bypass.

The first gateway start collided with this same project's older simulated-demo process on 8080. After identifying that process by its cwd and command, I stopped it and reran the documented Mode B command on the default port, consistent with README's instruction to check/free the ports. The new console ran on localhost's IPv6 address; the older console on IPv4 was not used as evidence. The tested gateway and console both came from the fresh clone. No custom gateway harness or undocumented port override was used. A second independent start while the new gateway occupied 8080 reproduced the same setup failure (BB-alwaz-04).

The main findings were reproduced after stopping and starting the documented gateway again, creating a new temporary seeded database and reloading/signing into the browser. No clock, database, source or policy manipulation was used to simulate expiry.

## BB-alwaz-01: The required bug-bash guide is absent from main
- Check: A1 / task step 1
- Severity: P2
- Steps:
  1. Clone `https://github.com/TeamElara/Aevia-AI.git` into a new directory and check out main at the commit above.
  2. Run `cat docs/BUG-BASH.md`.
  3. Repeat with `git show HEAD:docs/BUG-BASH.md`; the GitHub contents API for that path at `ref=main` also reproduces it.
- Expected: The assigned setup instructions, synthetic values, check IDs and reporting format are available on main before testers start.
- Actual: `cat` reports `No such file or directory`; Git reports `fatal: path 'docs/BUG-BASH.md' does not exist in 'HEAD'`; GitHub returns HTTP 404. The file exists only in open PR #40.
- Evidence: Both local checks and independent remote HTTP 404; fetching main again still yielded `f8fc43d` with no such tree entry.
- Flaky: no (local and remote checks repeated; identical main revision).

## BB-alwaz-02: Mode B cannot run any acting-post lifecycle check
- Check: C1–C9
- Severity: P2
- Steps:
  1. On tested main, run `npm ci`, `npm run demo:gateway`, then `npm run dev --workspace @leakshield/web -- --strictPort` in another terminal, as Mode B specifies.
  2. Open localhost:5173 and select Ravi Menon. Inspect **Assign my post**. Try again after **New chat**, a refresh and switching away/back.
  3. Authenticate as Ravi through `POST /api/auth/login` (keep the returned token only in memory), then call `GET /api/me`, `GET /api/delegations` and `POST /api/delegations` with `{ "to": "asha", "days": 2 }`.
  4. Select Admin and open **Approvals → Acting posts**. Also try Asha's `/api/me` and the same delegation-list routes.
  5. Stop/restart the gateway with the same command and repeat steps 2–4 on its fresh temporary database.
- Expected: Ravi can create a two-day HR cover; Asha's empty own-post state says **Nothing to assign**; Admin can list/end covers. Scheduled starts, validation, non-transitive lending and revoked-access checks can then be tested.
- Actual: The button is disabled even for Ravi. The UI says **Acting posts are not available on this gateway yet. Ask your administrator to enable them.** All listed APIs return **HTTP 501 `{ "error": "DELEGATION_UNAVAILABLE" }`** for Ravi, Asha and Admin. Admin's Acting posts panel shows the same unavailable error. No cover can be created, so a badge, hand-back/end, natural expiry or start-time transition cannot be reached.
- Evidence: [Ravi unavailable](img/alwaz-ravi-delegation-unavailable.jpg), [fresh-start Asha](img/alwaz-c1-fresh-restart.jpg), [Admin panel unavailable](img/alwaz-c8-admin-posts-unavailable.jpg). Identical 501 responses before and after an independent gateway restart. Source inspection confirms the tested Mode B entry point does not supply the acting-post service; PR #40 proposes that wiring but was not applied.
- Flaky: no (two independent gateway/database starts, multiple identities and browser/API routes).

### C-series attempts and their limits

| Check | Actual attempt / disposition |
| --- | --- |
| C1 | Asha's button is disabled, but the reason is a missing service rather than **Nothing to assign**. Reproduced after fresh restart. |
| C2 | Ravi's exact two-day grant returns 501; browser assignment is disabled. No successful cover exists. |
| C3 | Blocked by C2. No claim that inherited salary access or an HR-cover badge works. |
| C4 | Blocked by C2. No real grant exists to hand back/end, so post-end loss of access was not verified. |
| C5 | Requests starting exactly ten minutes ahead, expressed as UTC `Z` and the equivalent `+05:30` instant, both return 501. Scheduled/start transition, displayed local start/end times and timezone correctness remain unverified. I did not wait ten minutes for a grant that never existed. |
| C6 | Eight days, a start fifteen days ahead and a start ten minutes in the past each return 501 instead of the validation response. Attempts to grant to Asha, Meera, CEO and Admin all return 501; the three-active/fourth-colleague rule cannot be reached. These are not reported as separate bypasses. |
| C7 | Asha's onward-HR request returns the same 501, before lending rules can run. No borrowed HR cover exists, so non-transitivity is unverified. |
| C8 | Admin's actual Approvals view has an Acting posts panel with the unavailable error; authenticated list API is also 501. No End control can be exercised. |
| C9 | Refresh, user switches and **New chat** preserve the unavailable state. No active-cover status/badge exists, so stale-badge correctness is unverified. |

## BB-alwaz-03: Salary citations returned by the gateway disappear in Chat and Inspect
- Check: B7 (citation presentation; not simulated answer quality)
- Severity: P2
- Steps:
  1. Start the documented Mode B gateway/console on the tested main revision.
  2. Sign in as Ravi Menon and send the exact starter `What are the salary bands FY27?`.
  3. Read the completed chat turn, then open **Inspect**. Look for the document title/source citation.
  4. Independently submit the same message as Ravi to `/api/chat`; inspect only its returned `citations` metadata. With the local evaluation capture enabled by Mode B, check document-context presence in memory, without saving/logging the payload.
  5. Repeat in a new chat and after a fresh gateway/database restart.
- Expected: The response visibly cites **Salary bands FY27**, as B7 requires. The source metadata the gateway already returns should remain visible to the user even when Mode B's provider only echoes.
- Actual: API returns `action=allow`, one provider call and `citations: [{ "doc_id": "salary", "title": "Salary bands FY27" }]`. The provider-context boolean confirms both seeded band names were included for Ravi. The console shows only the echo, Allowed, the reason, Inspect and one call. Neither Chat nor Inspect displays the returned citation/document title.
- Evidence: [Chat after fresh restart](img/alwaz-b7-fresh-restart.jpg), [Inspector without citation](img/alwaz-b7-no-citation.jpg). API metadata above repeated on both gateway starts. Frontend source references `citations` in its response contract, but no Chat/Inspector rendering consumes it.
- Flaky: no (four browser chats across two gateway/database starts; API metadata repeated).

This report does **not** treat the absence of an Amber/Indigo prose answer from the simulated echo provider as a model-quality bug. B7's real-model answer quality was not evaluated in Mode B. The failure here is the loss of the explicit citation metadata.

## BB-alwaz-04: Documented Mode B startup exits when its default port is occupied
- Check: A1 (environment-dependent setup failure, recorded as requested)
- Severity: P2
- Steps:
  1. Have an existing local simulated demo listening on 127.0.0.1:8080.
  2. In a fresh clone, run the documented `npm run demo:gateway`.
  3. With another successfully started demo on that same default port, repeat the exact command in a separate terminal.
- Expected: The setup should identify the occupied port clearly enough to complete the documented launch, with a documented Mode B recovery/alternate-port command if simultaneous demos are supported.
- Actual: Both starts terminate with Node's unhandled `Error: listen EADDRINUSE: address already in use 127.0.0.1:8080` and exit code 1. Mode B's CLI entry point fixes 8080; the bug-bash page has no alternate-port instruction. Freeing the old demo port allowed the exact command to run. This is an environment/setup limitation, not an access-control defect or a claim that a free-port launch fails.
- Evidence: Exact command `npm run demo:gateway`; error `code: 'EADDRINUSE'`, `syscall: 'listen'`, `address: '127.0.0.1'`, `port: 8080`, Node.js v24.19.0. Repeated with the independently started fresh-clone demo occupying the port.
- Flaky: no (2/2 attempts with the documented port occupied; free-port start succeeds).

## Summary

- Severity counts: **P0 0, P1 0, P2 4, P3 0**. One P2 entry is explicitly environment-dependent setup evidence (BB-alwaz-04).
- Top three: Mode B acting posts unavailable (02); salary citations missing from UI (03); required guide absent from main (01).
- No access bypass was reproduced in the checks that could execute. This is limited evidence: C-series start/end, timezone and revoked/delegated-access security remain blocked, not passed.
- No code/config fixes were attempted. PR #40 remained open and main stayed unchanged during this run.

## Passed

- **A2:** `/health` returned HTTP 200 `{ "status": "alive" }`; `/ready` returned HTTP 200 `{ "status": "ready" }`.
- **B1:** Exact synthetic KYC starter showed **Masked**, one call, and returned/restored synthetic values only in Asha's UI. Inspect showed Aadhaar/PAN tokens. API evaluation-capture checks found neither original synthetic Aadhaar nor PAN in the provider payload. [UI evidence](img/alwaz-b1-masked.jpg). Only masking/restoration was judged; the simulated echo is not evidence of real-model letter quality.
- **B2:** Exact sample secret was **Blocked**, zero calls. Clicking **Replace with [SECRET_…] and send** produced an Allowed answer and one call with the safe placeholder.
- **B3:** Exact English injection starter was **Blocked**, zero calls, in both browser and API.
- **B6:** Asha's exact salary question returned no salary ranges/citation. Rephrased salary requests and a role-bypass request also returned no seeded salary ranges or salary citations. Explicit `attached_doc: "salary"` was **Denied**, zero calls. The words Amber/Indigo in one variation came from the user's own query and were not counted as a leak.
- **B7, access subcheck only:** Ravi's exact query was permitted; API cited the salary document and in-memory provider-context checks found both seeded band names. Full B7 is not passed because of BB-alwaz-03 and Mode B's answer-quality limit.
- **B8:** CEO's exact board-minutes query and a rephrased version were **Denied**, zero calls. Asha's rephrased board query had no board citation. [CEO UI evidence](img/alwaz-b8-ceo-denied.jpg).
- **B9:** Browser Meera request showed **Pending approval** with zero calls; a separate browser tab signed in as **Admin** approved it; the original Meera conversation then showed Allowed and one call. A second browser request was rejected by Admin; Meera showed Denied, zero calls, with no provider answer. [Pending](img/alwaz-b9-pending.jpg), [approved](img/alwaz-b9-approved.jpg), [rejected](img/alwaz-b9-rejected.jpg).
- **B9, API variations:** Owner's pending-result read returned 202; Asha's read of Meera's actual request ID returned 404; Meera's attempt to decide returned 403. Admin approval returned 200; Meera's result returned 200/allow/one call/nonempty answer. Admin rejection produced 200/deny/zero calls/no answer. Repeated result reads returned 404 and repeated decisions returned 409. Result URLs used the pipeline `request_id`, not `approval_id`.
