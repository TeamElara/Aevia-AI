# Temporary access delegation

Someone going on leave can lend their own access to a colleague for up to a day. For example, Ravi (HR) can lend `hr` to Asha, and Asha can then read the HR salary bands until the loan ends. Anyone can lend, but only the groups they hold themselves.

## Rules

- **Your own groups only.** `employee` cannot be lent because everyone already has it, and `admin` cannot be lent at all. A person with nothing else to lend gets `NOTHING_TO_DELEGATE`.
- **Never onwards.** Lent groups cannot be lent again. They are added on top of the colleague's own groups and are never counted as their own.
- **Up to 24 hours.** The default is 24 hours, and anything from 1 to 24 hours is allowed. Access ends by itself on the next request after expiry.
- **Checked on every request.** Groups are resolved when the identity is resolved, so they reach retrieval, ACL, approvals and replay. If the lender loses a group, the loan of that group stops at once.
- **Ending a loan early.** The lender, the colleague (handing it back) or an admin can end a loan. Nobody else can see or end it.
- **One loan per colleague, three in total.** A new grant to the same colleague replaces the old one, and a person can lend to at most three colleagues at a time.
- **Audited as metadata only.** `delegation.granted` and `delegation.revoked` audit events hold a pseudonymous actor, the lent groups (`group:hr`) and the hours. They hold no names. They appear under All requests and are left out of request statistics. A loan's record is removed a week after it ends.

## API

All routes need the usual bearer token.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/me` | | `own_groups`, `delegated_groups`, `lendable_groups`, `groups` |
| GET | `/api/delegations` | | `given`, `received`, `max_hours`; for an admin also `active` |
| POST | `/api/delegations` | `{ "to": "asha", "hours": 8, "groups": ["hr"] }` (`hours` and `groups` are optional) | the delegation, `201` |
| DELETE | `/api/delegations/:id` | | the ended delegation |

Errors (the `error` field):

| Status | Code |
| --- | --- |
| 400 | `DELEGATE_TO_SELF` |
| 400 | `NOTHING_TO_DELEGATE` |
| 403 | `GROUP_NOT_DELEGABLE` |
| 404 | `DELEGATE_UNKNOWN` |
| 404 | `DELEGATION_NOT_FOUND` |
| 409 | `DELEGATION_LIMIT` |
| 400 | `INVALID_REQUEST`, for example `hours` outside 1–24 |

## Demo

1. Sign in as Asha and ask "What are the salary bands FY27?". No salary data comes back.
2. Sign in as Ravi and lend HR access to Asha for 8 hours.
3. Sign in as Asha again and ask the same question. The answer now cites *Salary bands FY27*.
4. Sign in as Ravi and end the loan. Asha's next question gets no salary data again.

This is a post-freeze feature. It changes nothing for anyone without an active loan, so `eval-freeze-v2` results are unaffected.
