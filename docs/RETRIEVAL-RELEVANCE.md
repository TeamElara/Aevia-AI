# Retrieval relevance fix — 15 October 2026

The three dev misses D-003, D-005 and D-015 came from unrelated query references:
body-only OR matches could select PII-bearing employee data or an approval-only
roadmap for an ordinary writing/code-review task.

Query retrieval now projects MongoDB `textScore` and sorts descending, with `_id`
used only as a stable tie-breaker. The ACL/provider/quarantine filters remain in
the Mongo query before ranking and the bounded 50-candidate pool. After applying
topic eligibility, candidates scoring below 50% of the strongest eligible hit
are excluded before the requested final top-k (default 8).

Eligibility requires a title-topic anchor. Multi-term queries need two distinct
meaningful matching terms across title/body, after basic Unicode/case/plural
normalization and removal of grammatical/request words. Approval/deny references
always require two distinct matching terms. This prevents a lone common word
such as “review” from requesting confidential material. The matcher is a
conservative lexical heuristic, not semantic retrieval; legitimate paraphrases
without a title anchor can be omitted. Explicit attachments retain their
separate validated selection path and all existing ACL/provider checks.

The existing one-word flagged-reference tests now use two topical terms, as
required by the new contract. The external-deny metadata test explicitly
attaches its document so it tests provider restrictions independently of its
artificial non-topical title. Separate regressions cover actual query selection,
score ordering against reversed IDs, low-score suppression, ACLs, quarantine,
and all three dev prompts returning no references.

Validation on this working tree:

- Dev HTTP evaluation: **20/20**, precision/recall **1.0**, provider/user leaks **0**,
  request errors **0**; explicitly simulated loopback model.
- D-003, D-005 and D-015 are now allow/mask/allow. D-009/D-013 deny,
  D-011 approval and D-012 quarantine remain zero-call boundaries.
- 16 Mongo retrieval/security checks passed; the historical 37-fixture test was
  explicitly skipped because it opens held-out/robustness data.
- 19 focused production access/approval integration checks passed.
- Gateway/access TypeScript checks passed.

Only `eval/dev.jsonl` was opened/evaluated for this fix. Held-out/robustness files,
expectations, detector rules and freeze tags were not changed. New metadata-only
report: `results/retrieval-relevance-dev/dev-leakshield.json`. Previous reports
remain historical; the Eval UI selects the newest report per dataset/mode rather
than rendering duplicate rows. Older held-out/baseline reports are not reruns of
this retrieval revision.

Removed `pnpm-lock.yaml` and `pnpm-workspace.yaml`; npm workspace/package-lock
remain canonical. The access CI path filters now watch `package-lock.json`.
