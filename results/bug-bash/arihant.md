# Bug bash: arihant
- Commit: f8fc43d (main, after #39). The gateway and console under test were built from this exact tree.
- Mode: A (Groq `openai/gpt-oss-120b`), gateway on 8080, console via Vite on 5174.
- Setup note: the already-running local gateway and console were used instead of a fresh clone. Setup (A1) is Mahatva's check.
- OS / browser: macOS, Chromium (Claude in-app browser), at 375×812, 768×1024 and 1440×900, light and dark.
- Checks run: A2, B1–B3, E1–E7, F1, F2.

## BB-arihant-01: Fast view switching hits the server-wide login limit and blanks the dashboards
- Check: E1, F2
- Severity: P0. A presenter clicking between dashboards can break the console for everyone for up to a minute.
- Steps:
  1. Open the console.
  2. Click Incidents, then Overview, and repeat about 12 times within a minute.
- Expected: the dashboards keep loading.
- Actual: `POST /api/auth/login` returns 429. Overview shows `Error: RATE_LIMITED` with empty tiles (`–`).
- Evidence: 16 logins in about 6 s, one of them 429. Each admin view logs in as `admin` when it mounts (`apps/web/src/lib/useAdmin.ts:11`), and in dev, React StrictMode doubles it. The gateway's login limit is 30 per minute for the whole server (`apps/gateway/src/app.ts`, `/api/auth/login`), so chat users switching identity in that minute are refused too.
- Flaky: no (reproduced twice)

## BB-arihant-02: Gateway down shows "Gateway returned 500" while the sidebar still says live
- Check: E7
- Severity: P2
- Steps:
  1. Open Chat with the gateway running.
  2. Stop the gateway.
  3. Send a message.
- Expected: a clear "gateway unreachable" message, and the sidebar status changes from **live gateway**.
- Actual: the reply reads `Gateway error: Gateway returned 500` (the Vite proxy's 500), and the sidebar still says **live gateway**. After the gateway restarts, the next message works without a reload.
- Evidence: reply text as above; sidebar text "live gateway".
- Flaky: no

## BB-arihant-03: Messages over 30,000 characters fail with a raw code
- Check: E6 (very long message)
- Severity: P3
- Steps:
  1. Paste 31,000 characters into the composer.
  2. Send.
- Expected: a limit shown before sending, or a plain message such as "Messages can be up to 30,000 characters."
- Actual: `Gateway error: INVALID_REQUEST`. The composer has no length limit or counter.
- Flaky: no

## BB-arihant-04: Composer placeholder runs under the attach and send buttons on mobile
- Check: E2
- Severity: P3
- Steps:
  1. Open the console at 375 px.
  2. Look at the empty composer while the typewriter placeholder shows a long hint.
- Expected: the placeholder wraps before the 📎 and send buttons.
- Actual: the placeholder ends at x=350 while the 📎 button starts at x=258, so the text runs under both buttons.
- Flaky: no

## BB-arihant-05: Rapid navigation logs "AbortError: Transition was skipped"
- Check: E1
- Severity: P3
- Steps:
  1. Click between the five views quickly.
- Expected: no console errors.
- Actual: repeated `Uncaught (in promise) AbortError: Transition was skipped`. `withTransition` (`apps/web/src/lib/motion.ts`) never handles the rejected `ready`/`finished` promises of a skipped view transition. Views still render correctly.
- Flaky: no

## Passed
- **A2:** `/health` reports alive and `/ready` reports ready.
- **B1:** KYC is redacted, 1 call, and no raw value in the model payload.
- **B2:** the AWS key is blocked with 0 calls.
- **B3:** the injection is blocked with 0 calls.
- **E1:** all five views open and render.
- **E2:** no page-level horizontal scroll on any view at 375, 768 or 1440 px in light or dark. Wide tables scroll inside their own box.
- **E3:**
  - "Start a conversation" focuses the message box;
  - all five starter chips are present (the "L5" chip is gone);
  - Pause motion toggles the animation;
  - a `prefers-reduced-motion` rule exists. OS-level reduced motion could not be emulated in this browser.
- **E4:**
  - the user picker opens and focus moves into it;
  - Escape closes it and returns focus;
  - the Inspector opens and its carousel moves;
  - switching from Asha to Ravi mid-reply keeps Asha's late answer out of Ravi's chat.
- **E5:** a `:focus-visible` ring is defined, Escape closes the dialogs and the drawer, and focus is restored.
- **E6:** a markdown table, code block and list render; at 375 px nothing overflows the page, and the table scrolls inside its box.
- **E7 (recovery):** after the gateway restarts, chat works again without a reload.
- **F1:** a blocked request from another session appears live as a new Incidents row, with no prompt text, values or user names.
- **F2:** Overview changes sensibly between 15 min, 1 hour and 6 hours (6, 11 and 93 requests). Bars have hover and focus tooltips and a screen-reader table.
