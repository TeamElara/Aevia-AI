# Five-minute backup video

Download [LeakShield-Backup-5min.mp4](https://github.com/TeamElara/Aevia-AI/releases/download/demo-backup-2026-10-15/LeakShield-Backup-5min.mp4) for offline playback. [Release and provenance](https://github.com/TeamElara/Aevia-AI/releases/tag/demo-backup-2026-10-15). The MP4 is a release asset, outside Git source history.

Captured on 15 October 2026 from main `f30d712a5de992ea79b0748bcce52bc6a7e8cc2e`, with real Groq `openai/gpt-oss-120b`, `CLASSIFIER_BACKEND=none` and synthetic fixtures. This is an **edited screenshot walkthrough with local synthetic narration**, combining actual browser states, explicit-document API responses and a real stock OpenAI SDK run. It is not a continuous capture or a substitute for Arihant and Ojaswi's two-person rehearsals.

| Time | Segment |
| --- | --- |
| 0:00–0:25 | Title and seven checkpoints |
| 0:25–1:15 | KYC masking, restoration and same-token follow-up |
| 1:15–1:35 | Secret block at zero calls, then placeholder replacement |
| 1:35–2:25 | English, Hinglish and base64 injection blocks |
| 2:25–3:15 | Explicit-document ACL checks and signed-in Ravi's salary answer |
| 3:15–3:35 | Poisoned vendor attachment quarantined |
| 3:35–3:55 | Garuda pending → administrator approval → Meera's answer |
| 3:55–4:10 | Stock OpenAI SDK and buffered streaming |
| 4:10–4:50 | Live subset, separately labelled frozen v1 metrics, incidents |
| 4:50–5:00 | Closing |

## What this run actually showed

- KYC returned MASKED, restored both identifiers, and reused the Aadhaar token in the follow-up.
- The credential and three authored injections stopped at zero provider calls; replacement was allowed.
- Explicit `attached_doc: salary` requests from Asha returned DENY at zero calls, including an impersonation attempt. Ravi received the synthetic Amber/Indigo bands. The corpus has no L5 figures.
- Ordinary free-text chat excludes inaccessible sources but may remain ALLOWED and make a provider call without the restricted source. Do not describe that badge as DENIED. Likewise, the poisoned vendor FAQ is excluded from ordinary retrieval; there is no clean vendor-policy source in this corpus to support an answer. Explicit `attached_doc: vendor` returned QUARANTINE at zero calls.
- Garuda waited at zero calls, then a hash-bound admin decision returned an answer to Meera after one call.
- Current live subset: **9/10 correct, 7/7 attacks caught, one benign false positive, zero observed leaks**. H-047 returned REDACTED rather than the expected WARN. This result is not a new frozen benchmark.
- Keep the headline **frozen v1: 12 → 1 provider leak flags**, same 60 cases on the original real Groq 20b model; user flags 1 → 0. H-020 is the IFSC code permitted by warn policy. The video labels this separately from the current 120b walkthrough. No frozen reports or rules were changed.

## Playback verification

The 1440×900 H.264/AAC file is 300.05 seconds and 5,211,012 bytes. Full video/audio decoding passed, narration is non-silent, encoded chapter frames were inspected, and browser playback loaded without a media error. SHA-256: `36cfe5b36e2aa7df2f997ec3ce9db73a301ff58a720ef9bf4b4ccf1e54ea9473`.

The prepared laptop's offline copy is in `Documents/LeakShield-Demo-Notes/LeakShield-Backup-5min.mp4`, outside both checkouts. Download before rehearsing so the backup works without Wi-Fi. Two rehearsals with the designated driver and narrator still require team coordination.
