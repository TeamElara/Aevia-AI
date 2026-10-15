# Latest v2 account/API evidence — 15 October 2026

The user supplied a key privately for this task. It is stored only in ignored, mode-0600 `.env`; it is absent from reports and Git. Real inference with `openai/gpt-oss-20b` succeeds. Metadata evidence: `results/freeze-v2-groq/account-api-evidence.json`.

| Setting | Evidence | Status |
| --- | --- | --- |
| Selected/returned model | openai/gpt-oss-20b | Verified by real API request |
| RPD | 1,000 | Verified response header; documented daily window |
| TPM | 8,000 | Verified response header; documented minute window |
| RPM / TPD | Not returned by these headers | Unverified for this organization |
| ZDR global/per-feature | Requires authenticated Data Controls | Unverified; no setting changed |

Groq explicitly defines the request-limit header as RPD and the token-limit header as TPM: https://console.groq.com/docs/rate-limits (checked 15 October 2026). This supports those two window mappings; it does not establish complete account limits. Prior records below withheld window mapping until that documentation was verified.

For the judge: “Masked prompts and approved content do reach Groq. The real API/model and two quota windows are verified. The organization's ZDR state has not been verified, so we do not claim zero retention.” Public retention documentation was rechecked: https://console.groq.com/docs/your-data . Usage metadata and retention exceptions are distinct from an enabled organization ZDR setting. This project uses synthetic evaluation data.

The key was disclosed in chat and should be rotated after testing; never paste it into the group, a deck or a GitHub comment. API authorization does not create a Groq console session. The earlier browser gate denial was not bypassed.

## Historical records

# Groq Q&A evidence — 15 October 2026

Verified public documentation:

- Groq's inference inputs/outputs are not retained by default, but reliability/abuse investigations may log them for up to 30 days, with legal-retention exceptions. Usage metadata is retained. Organization admins can enable Zero Data Retention in Data Controls. Batch and fine-tuning have separate persistence rules. Source: https://console.groq.com/docs/your-data .
- Rate limits are organization-level and model-specific. Check the team's console limits and response headers; retry HTTP 429 with the server's retry timing. Source: https://console.groq.com/docs/rate-limits .

Team-account verification remains pending. The browser approval gate rejected console.groq.com, so the agent cannot inspect the team account. The team’s non-secret model limits and retention configuration have not been established. No credentials were searched outside the task or printed. Public policy is not proof of the team's selected configuration.

Record in the team console: organization/project, selected model ID, RPM/RPD/TPM/TPD limits, ZDR/global and feature settings, batch/fine-tuning state, timestamp and verifier. Do not store keys or raw user payloads in this document. Do not claim zero retention until this is checked. Approved document content does reach Groq.

## Continuation check

15 October 2026: an authorized check in the current in-app browser reached the GroqCloud sign-in page at `https://console.groq.com/home`, with no authenticated organization session. No account settings could be read; all team RPM/RPD/TPM/TPD and ZDR checks remain pending. This is separate from the historical approval-gate denial above. No credential entry or account-setting changes occurred.

The continuation subsequently verified real HTTPS inference with the locally
configured `openai/gpt-oss-120b`: four model calls and 8/8 synthetic boundary
checks. The first response advertised `x-ratelimit-limit-requests: 1000` and
`x-ratelimit-limit-tokens: 8000`; all observed rate/reset headers are retained
in `results/continuation-groq/boundaries.json`. Do not relabel these header
values as a complete RPM/RPD/TPM/TPD configuration; authenticated settings
inspection remains necessary. No header verified ZDR.
