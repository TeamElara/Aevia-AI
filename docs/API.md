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

## OpenAI-compatible drop-in: `POST /v1/chat/completions`

Lets an existing app adopt the gateway by changing only `baseURL`; `demo/sdk-demo.mjs` shows this. The request and response bodies follow OpenAI's Chat Completions format.

- **Auth:** `Authorization: Bearer <api key>`. Each demo API key maps to a seeded user, e.g. `ls_demo_asha` for `asha`. A JWT is not required on this path.
- **Pipeline:** the full pipeline runs on the last user message; earlier messages count as history. The canary is appended to the app's own `system` message.
- **Streaming:** with `stream: true`, the gateway buffers the whole model reply, inspects and restores it, and only then sends it as `chat.completion.chunk` SSE events, ending with `data: [DONE]`. Raw model tokens never stream through.
- **LeakShield's decision** goes in an extra top-level field that OpenAI SDKs ignore:

```json
"leakshield": { "action": "mask", "reason": "2 values masked before sending", "rule_ids": ["pii.aadhaar.verhoeff_ctx"], "provider_calls": 1 }
```

- **When a request is blocked**, the gateway still returns `200` with a normal completion whose content is the block message (`finish_reason: "stop"`), so unmodified apps show the reason instead of crashing. `leakshield.provider_calls` is `0`.

## Browser extension: `POST /v1/scan`

Used by the Chrome extension on chatgpt.com (PLAN.md, stretch). It scans text **without calling any model**. Auth works the same way as for `/v1/chat/completions`.

Request:

```json
{ "text": "KYC letter for Aadhaar 2345 6789 0124", "history": ["earlier user messages, oldest first"] }
```

Response:

```json
{
  "action": "mask",
  "reason": "1 value masked",
  "rule_ids": ["pii.aadhaar.verhoeff_ctx"],
  "findings": [{ "category": "AADHAAR", "source": "prompt", "via": "raw", "ruleId": "pii.aadhaar.verhoeff_ctx" }],
  "masked_text": "KYC letter for Aadhaar [AADHAAR_K7Q2]",
  "vault": { "[AADHAAR_K7Q2]": "2345 6789 0124" }
}
```

- `vault` holds only values the caller typed in this request. The gateway does not keep it: the extension holds it in tab memory, so it can restore values in the rendered reply.
- With `action: "block"`, `masked_text` and `vault` are `null`, and the extension stops the submit.
- The gateway still writes the usual metadata-only audit event.

## Eval mode (used by `eval/run.mjs`)

Only when the gateway is started with `EVAL_MODE=1`. Without it, the gateway ignores both headers below.

**`X-Eval-Capture: 1`** on `POST /api/chat` adds an `eval` object to the response:

```json
"eval": {
  "provider_calls": 1,
  "provider_payload": "<every message the provider received for this request, joined with \\n>"
}
```

- `provider_payload` is `null` when the provider was not called.
- The runner checks it for leaks, keeps only booleans, and discards it. The gateway must never log or persist it.

**`X-LeakShield-Mode: passthrough`** runs the **baseline**:
- Authentication still applies.
- The prompt goes to the same model unmasked, with naive RAG: the same `$text` search but **no ACL filter**, no quarantine, no outbound scan and no response checks.
- Combine it with `X-Eval-Capture: 1` so the runner can count the baseline's leaks.

**Canaries.** Every canary marker the gateway plants starts with `LS-CANARY-`. If one appears in a delivered `answer`, the runner counts a user leak.

## Dashboard endpoints (admin token only)

The console signs in as `admin` for the Incidents, Overview and Approvals views. Every other user gets `403`.

### `GET /api/events?token=<jwt>`

A Server-Sent Events stream. `EventSource` cannot set headers, so the token goes in the query string. Each message's `data:` is one `AuditEvent`, using only the allowlisted fields in PLAN.md §8:

```json
{
  "request_id": "req_01J…",
  "ts": "2026-10-16T10:42:07.118Z",
  "user_pseudo": "u_7f3a91c2",
  "conversation_pseudo": "c_0b44e1d9",
  "stage": "inspect",
  "categories": ["AADHAAR", "PAN"],
  "counts": { "AADHAAR": 1, "PAN": 1 },
  "rule_ids": ["pii.aadhaar.verhoeff_ctx", "pii.pan"],
  "policy_version": 3,
  "action": "mask",
  "model_called": true,
  "via": ["raw"],
  "stage_ms": { "PII": 3, "Inject": 41, "ACL": 2, "LLM": 620, "Out": 4 },
  "total_ms": 670
}
```

On connect, the gateway first sends the last 50 events, then sends new ones live.

### `GET /api/stats?window=60`

Aggregates over the last `window` minutes (default 60):

```json
{
  "window_minutes": 60,
  "requests": 128,
  "blocked_pct": 18.8,
  "masked_pct": 31.3,
  "by_category": { "AADHAAR": 22, "SECRET": 6, "INJECTION": 14 },
  "by_action": { "allow": 61, "mask": 40, "block": 24, "deny": 3 },
  "per_5min": [{ "t": "2026-10-16T10:00:00Z", "incidents": 4 }],
  "overhead_ms_p50": 46,
  "overhead_ms_p95": 118,
  "policy_version": 3
}
```

`per_5min` lists every bucket in the window, including empty ones. An incident is any event whose action is not `allow`. Overhead excludes `LLM` time and approval waits.

### `GET /api/approvals`

Returns the approval metadata stored in Mongo, newest first, with no payload:

```json
[{
  "approval_id": "apr_01J…",
  "request_hash": "sha256:9c1e…",
  "user_pseudo": "u_2c81aa07",
  "doc_ids": ["garuda-roadmap"],
  "reason": "Confidential document requires approval for external LLM",
  "status": "pending",
  "created_at": "2026-10-16T10:40:00Z",
  "expires_at": "2026-10-16T10:50:00Z"
}]
```

### `POST /api/approvals/:id/approve` and `POST /api/approvals/:id/reject`

The decision body includes `{ "request_hash": "<listed SHA-256 request hash>" }`; a mismatched hash returns `409`. Return the updated `Approval`. Transient `replaying` and terminal `failed` states may also appear. Approving makes the gateway re-check policy and ACL against `request_hash` and then replay the request. Rejecting, or letting the request expire, deletes the in-memory copy. A decision on a request that is no longer pending returns `409`.

The access integration host also supports `GET /api/access/results/:request_id?conversation_id=...` for the original user and conversation: `202` while pending, then a buffered ChatResponse once. Other users/conversations and consumed results receive `404`.
