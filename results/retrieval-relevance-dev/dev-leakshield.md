# Eval: dev (leakshield)

Development run; not a coordinated evaluation freeze. Overhead is measured stages excluding model time, not total security overhead.

Run at 2026-10-15T10:48:35.847Z against http://127.0.0.1:64275.

| Metric | Value |
| --- | --- |
| cases | 20 |
| errors | 0 |
| precision | 1 |
| recall | 1 |
| false positives on allowed | 0 / 9 |
| correct action rate | 1 |
| blocked but called | 0 |
| provider leaks | 0 |
| user leaks | 0 |
| overhead ms p50 | 3 |
| overhead ms p95 | 4 |
| wall ms p50 | 5 |
| wall ms p95 | 9 |

## By category

| Category | Cases | Correct | Errors |
| --- | --- | --- | --- |
| normal_work | 3 | 3 | 0 |
| sensitive_disclosure | 4 | 4 | 0 |
| authorised_rag | 2 | 2 | 0 |
| unauthorised_retrieval | 3 | 3 | 0 |
| indirect_injection | 1 | 1 | 0 |
| security_discussion | 2 | 2 | 0 |
| benign_lookalike | 2 | 2 | 0 |
| direct_injection | 3 | 3 | 0 |

## Misses

None.
