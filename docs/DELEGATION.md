# Acting posts (temporary access delegation)

Someone going on leave can assign their post to a colleague for a limited time. For example, Ravi (HR) is away for two days from Monday 9:00. He assigns HR to Asha for exactly that window, and during it Asha can read HR data such as the salary bands. Anyone can assign their post, but only the groups they hold themselves.

A post is the lender's groups (`hr`, `engineering`, `executive`). Documents shared with one named person (`allowed_users`, such as the CEO's board minutes) remain personal and are not part of a post.

## Rules

- **Your own groups only.** `employee` cannot be lent because everyone already has it, and `admin` cannot be lent at all. A person with nothing else to lend gets `NOTHING_TO_DELEGATE`.
- **Never onwards.** Lent groups cannot be lent again. They are added on top of the colleague's own groups and are never counted as their own.
- **Up to 7 days, now or later.** A cover lasts `hours` (1–168) or `days` (1–7), and the default is one day. It starts now, or at `starts_at`, which can be up to 14 days ahead. It begins and ends by itself on the next request after its start or end time.
- **Checked on every request.** Groups are resolved when the identity is resolved, so they reach retrieval, ACL, approvals and replay. If the lender loses a group, the loan of that group stops at once.
- **Ending a loan early.** The lender, the colleague (handing it back) or an admin can end a loan. Nobody else can see or end it.
- **One cover per colleague, three in total.** A new grant to the same colleague replaces the old one, and a person can lend to at most three colleagues at a time. Booked covers count toward the three, and a booked cover can be cancelled before it starts.
- **Audited as metadata only.** `delegation.granted` and `delegation.revoked` audit events hold a pseudonymous actor, the lent groups (`group:hr`) and the hours. They hold no names. They appear under All requests and are left out of request statistics. A loan's record is removed a week after it ends.

## API

All routes need the usual bearer token.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/me` | | `own_groups`, `delegated_groups`, `lendable_groups`, `groups`, `covering` (`for`, `groups`, `until`), `max_hours` |
| GET | `/api/delegations` | | `given`, `received`, `max_hours`; for an admin also `active` |
| POST | `/api/delegations` | `{ "to": "asha", "days": 2, "starts_at": "2026-10-19T09:00:00+05:30", "groups": ["hr"] }` (all but `to` are optional) | the cover with `status` `scheduled`, `active` or `ended`; `201` |
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
| 400 | `START_TOO_FAR` |
| 400 | `START_IN_PAST` |
| 400 | `INVALID_REQUEST`, for example `hours` outside 1–168, or both `hours` and `days` |

## Demo

1. Sign in as Asha and ask "What are the salary bands FY27?". No salary data comes back.
2. Sign in as Ravi and assign HR to Asha for 2 days.
3. Sign in as Asha again and ask the same question. The answer now cites *Salary bands FY27*.
4. Sign in as Ravi and end the cover. Asha's next question gets no salary data again.

To show a booked cover, set `starts_at` to a few minutes ahead. Asha gets nothing until then, and gets the salary bands once it starts.

This is a post-freeze feature. It changes nothing for anyone without an active loan, so `eval-freeze-v2` results are unaffected.
