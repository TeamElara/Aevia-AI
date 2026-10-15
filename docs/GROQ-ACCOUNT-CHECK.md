# Groq Q&A evidence — 15 October 2026

Verified public documentation:

- Groq's inference inputs/outputs are not retained by default, but reliability/abuse investigations may log them for up to 30 days, with legal-retention exceptions. Usage metadata is retained. Organization admins can enable Zero Data Retention in Data Controls. Batch and fine-tuning have separate persistence rules. Source: https://console.groq.com/docs/your-data .
- Rate limits are organization-level and model-specific. Check the team's console limits and response headers; retry HTTP 429 with the server's retry timing. Source: https://console.groq.com/docs/rate-limits .

Team-account verification remains pending. The browser approval gate rejected console.groq.com, so the agent cannot inspect the team account. The team’s non-secret model limits and retention configuration have not been established. No credentials were searched outside the task or printed. Public policy is not proof of the team's selected configuration.

Record in the team console: organization/project, selected model ID, RPM/RPD/TPM/TPD limits, ZDR/global and feature settings, batch/fine-tuning state, timestamp and verifier. Do not store keys or raw user payloads in this document. Do not claim zero retention until this is checked. Approved document content does reach Groq.
