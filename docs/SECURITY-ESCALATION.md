# Repeated-risk warnings and reporting hierarchy

This post-freeze, opt-in feature routes repeated authenticated policy interventions to supervisors for human review. It does not establish malicious intent, punish employees, change ACLs, suspend accounts or transmit prompts to managers. Existing frozen v1/v2 evidence is unchanged.

## Assumed demo hierarchy

The trusted configuration is `apps/gateway/security-hierarchy.json`:

| Activity by | First recipient | Next-level recipients | Security escalation recipients |
| --- | --- | --- | --- |
| Asha (employee) | Ravi (reporting manager) | Ravi + CEO | Ravi + CEO + Admin |
| Ravi (HR manager) | CEO | CEO + Admin | CEO + Admin |
| Meera (engineering manager) | CEO | CEO + Admin | CEO + Admin |
| CEO | Admin | Admin, higher severity | Admin, highest severity |
| Admin | CEO as designated independent reviewer | CEO, higher severity | CEO, highest severity |

These are demo reporting assumptions, not new document-access roles. In a real organization replace the map with employee → team lead → manager → department head relationships and designate independent security reviewers. The engine traverses configured managers; severe warnings additionally reach reviewers. If the chain ends, it uses an independent reviewer. Removed managers are skipped with a reviewer fallback. Configuration requires two distinct, existing reviewers, validates all referenced identities and rejects cycles/self-management. An actor never receives or acknowledges their own warning, including through the security oversight view.

## What counts

Each authenticated chat request contributes at most one signal. The sliding window is **15 minutes**, persisted across conversations and gateway restarts using the same database and audit HMAC secret.

| Signal | First warning | Next-level warning | Security escalation |
| --- | ---: | ---: | ---: |
| User-origin manipulation blocked at confidence ≥ 0.85 | 3 | 6 | 10 |
| Explicit document reference unavailable/unauthorized, zero provider calls | 5 | 10 | 15 |
| Credential-containing request blocked, zero provider calls | 6 | 12 | 20 |

Access-denial signals can include missing document references; they are not evidence that confidential data was obtained. Credential pasting can be accidental, so the UI recommends guidance rather than making an accusation. The higher credential threshold is intentional.

Normal PII masking, provider-destination denials (for example the CEO's board document on Groq), approval-required requests, trusted internal approval replays, retrieved poisoned documents, model-output violations and advisory `/v1/scan` requests do not contribute. User-origin findings are frozen before retrieval and output processing, preventing document-origin instructions from being attributed to the employee. Detection misses remain misses: this is not a general intent classifier or a guarantee that all probing is detected. Unauthenticated traffic cannot be attributed to an employee and is outside this feature.

Warnings have an atomic 15-minute cooldown per identity, signal kind and severity level. Repeated request IDs are counted once. Acknowledging a warning does not clear counts or prevent further escalation. A new warning after the cooldown has a new ID, so a stale acknowledgement cannot dismiss it.

## Privacy and delivery

Delivery is **in-app**, with a sidebar count/banner and a Warnings inbox that refreshes every 15 seconds. No email, Slack, SMS or external messaging is configured. The selected user's token is used; unlike legacy admin dashboards, this inbox does not sign in as the seeded admin.

Managers see only warnings assigned to them. Configured security reviewers can deliberately select Security oversight to inspect other users' warnings. The API still excludes their own activity. Delegated groups do not change reporting identity or grant reviewer privileges.

The dedicated stores contain identifiers, signal categories, counts, routing and acknowledgement timestamps only; no prompt, answer, matched value, document contents/title, reason text, JWT or API key. Raw subject IDs exist only in the access-controlled warnings store to identify the employee for their authorized reviewer. Audit/SSE uses HMAC pseudonyms and `security.alert` metadata events instead.

Signals have a one-hour TTL and are counted by timestamps rather than waiting for TTL deletion. Latest warnings are retained for 30 days. The inbox holds the latest warning per actor/kind/level and returns up to 100 current records with a truncation indicator; pseudonymous alert audit events retain earlier notification metadata. A durable pending notification is retried after an audit outage and becomes visible only after its audit event persists. Delivery is at least once: a crash after audit persistence can replay the same alert ID; consumers can deduplicate it. No automatic disciplinary action is taken.

## Enable and verify

Production is off by default:

```dotenv
SECURITY_ESCALATION_ENABLED=false
SECURITY_HIERARCHY_PATH=apps/gateway/security-hierarchy.json
```

Enable only after configuring and testing hierarchy against the users in the target database. DB-backed principals are required; the feature cannot run in unprotected baseline mode. Frozen eval reports and datasets are untouched. A future evaluation must record the flag and hierarchy configuration.

For an isolated keyless demo, set `SECURITY_ESCALATION_ENABLED=true` in the shell and run `npm run demo:gateway`. It uses a temporary database and a clearly simulated provider; it does not enable the feature in an existing production process. On Windows, the shell assignment is `$env:SECURITY_ESCALATION_ENABLED='true'`.

Demo: as Asha, send the supplied synthetic injection starter three times in new chats. Each request stays blocked at zero model calls. Switch to Ravi: a manager warning appears. At six attempts CEO receives the next-level warning; at ten Admin receives the security warning. Acknowledgement marks it reviewed without changing Asha's access. Separately, repeated Admin activity routes to CEO rather than Admin reviewing themselves.

Validation covers real-Mongo routing for every seeded identity, actor/peer isolation, fake-clock boundaries, concurrent duplicates, cooldown renewal, restart persistence, outbox recovery, default-off behavior, unchanged disclosure controls, privacy, and late UI responses across identity switches.

