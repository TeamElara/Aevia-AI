# Five-minute team demo script

Development rehearsal plan. `npm run demo:access` runs real integration boundaries with an explicitly simulated echo provider. Model-answer quality and a real-provider video remain unverified.

0:00–0:25 — Alwaz introduces the seven-stage architecture and ACLs as the primary boundary.
0:25–1:15 — Team gateway owner demonstrates Asha's synthetic KYC record and two-turn masking/restoration using the reference vault and actual detectors; use a real model only after the team supplies its transport.
1:15–1:35 — Demonstrate fake-key block and zero provider calls with actual outbound detectors.
1:35–2:25 — Detector owner demonstrates injection variants using measured cases.
2:25–3:15 — Alwaz demonstrates Asha denied salary access, impersonation still denied, Ravi HR permitted. No restricted titles in denied responses.
3:15–3:35 — Alwaz demonstrates quarantined vendor/onboarding sources.
3:35–3:55 — Meera requests Garuda, admin approves, Meera retrieves the answer. Reject and revoked-membership paths have deterministic test evidence.
3:55–4:40 — Show the team's live subset/frozen report when available; currently show only Alwaz's scoped access results.
4:40–5:00 — State limitations: approved content reaches Groq; fingerprints miss paraphrases; classifier English only. Close with: Useful answers, and you can see exactly what reached the model.

Backup: run `npm run test` for deterministic access evidence. A complete recorded UI demo and Ollama fallback require the team's gateway. Do not label simulated responses as real model output.
