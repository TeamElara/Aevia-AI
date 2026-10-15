# Arihant + Ojaswi rehearsal and narration

Driver: Arihant. Narrator: Ojaswi. Deck/evidence: Alwaz. Use eval-freeze-v2 (05d1afc) decision code with the latest accompanying reports/deck. Proposed slots for 15 October 2026: **18:00–18:15 IST** and **18:20–18:35 IST**. These are proposed coordination slots, not booked meetings or confirmed teammate availability. No messages or invitations have been sent.

## Before both runs

Use the root npm lockfile. Keep CLASSIFIER_BACKEND=none. Start the production real-provider rehearsal host and console per docs/MAHATVA_FINAL.md; make the provider visible. Use only synthetic examples. Keep the unprotected baseline on its separate loopback service, never the demo console. Have the frozen metadata reports and backup screenshots/deck ready. Do not show .env, a terminal containing credentials, raw logs or an API key.

## Five-minute run

| Time | Arihant drives | Ojaswi narrates |
| --- | --- | --- |
| 0:00–0:25 | Cover | “LeakShield checks disclosure before and after the model. Our scope is the company gateway; it does not protect unrelated direct website use.” |
| 0:25–0:55 | Architecture | “JWT identity drives Mongo ACLs before top-k. We scan the assembled payload and inspect the answer before restoration.” |
| 0:55–1:35 | Asha: synthetic PAN/Aadhaar; then a fake key | “The model sees a token, while only the same user's allowed context can restore their value. A credential request makes zero provider calls.” |
| 1:35–2:10 | Asha requests salary; Ravi requests salary | “The text claim ‘I am HR’ changes nothing. Retrieval uses the authenticated principal. Admin status alone is not document access.” |
| 2:10–2:55 | Meera: attached Garuda; admin approves hash; return to Meera | “External disclosure pauses at zero calls. Approval is encrypted, expires and re-enters the full pipeline once. Revoked or changed access prevents release.” |
| 2:55–3:35 | Metrics slide and committed reports | State the exact protected/baseline leak flags, action match and model from the same v2 reports. Never say universal zero leaks. |
| 3:35–4:10 | Misses/model decision | “Four Hinglish attacks remain missed by the injection detector. Other safeguards can still intervene. The classifier is off because 19 of 110 benign examples were flagged.” |
| 4:10–4:40 | DPDP mapping | “These controls support data minimization and security safeguards; they do not by themselves establish legal compliance.” |
| 4:40–5:00 | Limits | “Approved content reaches Groq. Organization ZDR is not yet confirmed. Fingerprints detect copying, not all paraphrases.” |

First rehearsal: verify masks, zero-call blocks, ACLs, queue ownership and final metrics; note the actual elapsed time and any failure. Second: repeat without changing frozen decision code, practise transitions and Q&A, then record the five-minute backup video if the team agrees. Record actual participants/time/provider and the video path after it exists. This file is a runnable plan, not evidence that the joint rehearsal or recording occurred.

Deck: docs/LeakShield-Freeze-v2.pptx. Source metrics: results/freeze-v2-groq/. Misses and limitations: docs/LIMITATIONS.md. Current Groq settings evidence: docs/GROQ-ACCOUNT-CHECK.md.
