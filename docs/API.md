# Gateway API used by the web console

The contract between Mahatva's gateway (`apps/gateway`) and Arihant's console (`apps/web`). The console's types live in `apps/web/src/api/contract.ts`. If the gateway needs a change, update both in the same PR.

All paths are served by the gateway. In dev, Vite proxies `/api` and `/v1` to `GATEWAY_URL` (default `http://localhost:8080`).

## `GET /api/health`

No auth. Returns `200 { "ok": true }` when the gateway is up. The console checks this at login: with no gateway it falls back to its built-in mock and labels every reply MOCK.

## `POST /api/auth/login`

Demo login with no password: issues a JWT for one of the seeded users (`asha`, `ravi`, `meera`, `ceo`, `admin`). Identity comes only from this token, never from prompt text.

Request:

```json
{ "user": "asha" }
```

Response `200`:

```json
{
  "token": "<jwt>",
  "user": { "id": "asha", "name": "Asha Rao", "role": "Employee", "groups": ["employee"] }
}
```

## `POST /api/chat`

Header: `Authorization: Bearer <jwt>`. The gateway runs the full pipeline (PLAN.md §3) and returns the inspected result. The response is buffered, never streamed.

Request:

```json
{ "conversation_id": null, "message": "Draft a KYC letter for Aadhaar 2345 6789 0124" }
```

`conversation_id` is `null` on the first turn. The gateway creates one and returns it, and the console sends it back on later turns. The vault is keyed by `(user_id, conversation_id)`.

Response `200`:

```json
{
  "request_id": "req_01J…",
  "conversation_id": "conv_01J…",
  "answer": "Dear customer, Aadhaar 2345 6789 0124 is verified…",
  "action": "mask",
  "reason": "3 values masked before sending",
  "rule_ids": ["pii.aadhaar.verhoeff_ctx", "pii.pan"],
  "findings": [
    { "category": "AADHAAR", "source": "prompt", "via": "raw", "ruleId": "pii.aadhaar.verhoeff_ctx" }
  ],
  "stage_ms": { "PII": 3, "Inject": 41, "ACL": 2, "LLM": 620, "Out": 4 },
  "sent_to_model": "Draft a KYC letter for Aadhaar [AADHAAR_K7Q2]",
  "provider_calls": 1,
  "citations": [{ "doc_id": "leave-policy", "title": "Leave and WFH policy" }]
}
```

| Field | Notes |
| --- | --- |
| `answer` | Final text for this user, after restore and link sanitising. The console renders it as plain text. |
| `action` | Strictest action taken: `allow`, `warn`, `mask`, `redact`, `quarantine`, `deny`, `require_approval`, `block`, `block_response` |
| `reason` | Short human reason, or `null` for a clean allow. Must never contain a sensitive value or a denied document title |
| `findings` | Category, source, `via` and rule only. **Never** the matched value or its offsets |
| `stage_ms` | Ordered stage name → milliseconds. Stages that did not run are left out |
| `sent_to_model` | The user-turn text exactly as the provider received it (tokens, not values), or `null` when the provider was not called. Shown in-session only; the console never stores it |
| `provider_calls` | `0` for anything blocked at stages 1–5 |
| `citations` | Docs this user may read that were used. Empty for denials |
| `approval_id` | Present only when `action` is `require_approval` |

Errors: `401` bad or missing token, `400` empty message, `503` provider down after retries. Body: `{ "error": "<short message>" }`, with no prompt text.

## Still to agree

- `GET /api/events`: SSE stream of `AuditEvent` for the Incidents view (hour 9)
- `GET /api/approvals`, `POST /api/approvals/:id/approve|reject` (hour 12)
- Eval mode: provider call counter + captured-payload booleans per request (hour 9)
