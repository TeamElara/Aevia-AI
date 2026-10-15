# Alwaz continuation — 15 October 2026

Continued from main `55e4f5a`, after fetching GitHub. PR #1 is already merged;
main includes the later team integration and console work. No teammate commits
were reset. This continuation uses a separate branch and PR.

## Implemented and verified

- Preserved existing validated attachment API and ACL-before-top-k retrieval.
  Fixed console live-eval and isolated baseline attachment propagation. Exact
  selection makes paraphrases exercise the intended reference.
- Explicit quarantined attachments now stop before a provider call. Generic
  missing/forbidden responses reveal neither restricted titles nor citations.
- Completed approval polling now rechecks fresh memberships, all cited document
  ACLs and quarantine. Revocation withholds and consumes the answer. Replay
  already retains the attachment and recomputes the payload/ACL/provider hash.
- Versioned local/external expectations retain original labels and the reason
  for each semantic difference. No detector tuning or fixture rewrites occurred.
- Rate limits now return the actual Retry-After window; the evaluator retains
  metadata-only failures without copying arbitrary upstream error text.
- Development reports include source commit/dirty state, dataset hash, model and
  provider configuration. The console displays simulated reports separately and
  does not infer a freeze from a report filename.

## Validation and simulated comparison

414 unit/security tests + 53 real-service integration tests = **467 passed**.
Gateway/access TypeScript checks, separate verification-script TypeScript check,
dataset validation, web production build and ESLint pass. Test servers required
loopback networking outside the filesystem sandbox; initial EPERM failures were
environment failures, followed by the successful authorized runs.

| Dataset | Cases | Protected exact contract actions | Protected provider leaks | Baseline provider leaks | Errors in either mode | Protected stage overhead p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dev | 20 | 17/20 | 0 | 4 | 0 | 3 / 5 ms |
| Held-out | 60 | 51/60 | 1 | 12 | 0 | 2 / 4 ms |
| Robustness | 60 | 52/60 | 0 | 14 | 0 | 1 / 4 ms |

Reports: `results/continuation-simulated/`. All 280 requests use the same
**simulated echo HTTP provider** and synthetic corpus; no real inference or
frozen accuracy is claimed. Provider leaks mean exact declared forbidden-value
assertions plus the evaluator's limited category-sensitive extraction. Zero is
not proof against arbitrary leaks. Baseline intentionally bypasses ACL,
quarantine and masking on these synthetic fixtures only. Both modes received
the same explicit attachments and used the same model identifier.

Overhead sums instrumented stages excluding model time, rounded to milliseconds.
It excludes uninstrumented audit/vault work and is not total security overhead.
Wall timings include HTTP and possible rate-limit waits. The tiny echo model
has no realistic inference latency. Initial runs before Retry-After had one
request error each in robustness (protected R-052, baseline R-042); committed
reruns have none. Do not compare these numbers with historical reference-host
or real-Ollama timings as though the measurement scopes were identical.

Remaining strict-action misses (protected):
- Dev: D-003, D-005, D-015.
- Held-out: H-003, H-007, H-009, H-014, H-016, H-019, H-020, H-045, H-052.
- Robustness: R-003, R-005, R-032, R-033, R-034, R-037, R-040, R-041.

H-020 fails a provider-forbidden-value assertion. Several other mismatches are
response-side redaction or extra query-retrieved context; R-032/R-037 have no
intervention. Preserve these failures for Ojaswi/team review after a coordinated
freeze. The 0.95 robustness intervention recall is not strict blocking accuracy.

## Browser and deck

Actual in-app-browser rehearsal against our isolated `127.0.0.1:5173` console
and `127.0.0.1:8081` simulated gateway passed masking/restoration, zero-call
pending approval, metadata-only admin approval and original-requester one-call
completion. The live subset finished 10/10 with quarantined H-037 at zero calls.
A separate existing service resolves on `localhost`; preliminary observations
there were discarded and the checks repeated against explicit IPv4 addresses.
No unrelated service was stopped. Browser evidence stays local; committed
reports contain no prompts, payloads, answers or secrets.

`docs/Alwaz-LeakShield-continued.pptx` supersedes the original deck for current
combined test evidence. It keeps eight editable slides and four native tables,
updates historical/current distinctions and labels int8 as refused in the
production gateway. Structural validation and rendered visual inspection passed.
`tools/update-deck.mjs` edits the original template using Artifact Tool; the old
Python builder is explicitly historical. Original reports and deck are retained.

## External dependencies and honest limits

No remote `eval-freeze` tag was present when checked. No accessible Ojaswi chat
was found; freeze coordination is requested on the continuation PR. Creating a
freeze unilaterally would not satisfy the handoff. The runner deliberately marks
these reports unfrozen, and no final model-backed report is loaded as frozen.

Ollama/Docker executables and local model weights were not found in standard
locations on this host. Historical real Ollama evidence remains untouched:
38 requests, 37 calls, 10/10 boundary checks, original action labels 4/31.
The local verification script now forwards attachments and records local
contract expectations, writing by default to a new continuation directory so
it cannot silently overwrite the historical report. That updated script has
been typechecked, not rerun against a model here.

Groq account model entitlement, RPM/RPD/TPM/TPD and ZDR configuration remain
unverified. Runtime configuration is not proof of authenticated account settings.
The authorized in-app-browser console check reached the Groq sign-in page without an authenticated session. No credentials were requested or committed. Docker startup, second-machine
rehearsal, a coordinated frozen real-model baseline and backup demo recording
remain outstanding. A same-machine clean-copy check is recorded separately when
completed; it does not imply Docker or second-laptop verification.
