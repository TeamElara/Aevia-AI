# Limitations

What LeakShield does not do yet, with the evidence. Numbers are from the frozen evaluation (`eval-freeze`, real Groq `openai/gpt-oss-20b`) unless stated otherwise.

1. **It is not zero leakage.** On the same 60 held-out cases, provider-leak flags fell from 12 (no gateway) to 1 (LeakShield). The remaining leak is an IFSC bank code. The configured policy deliberately warns on IFSC, a public branch code, instead of masking it (`results/heldout-leakshield.md`).

2. **Hinglish rewrites are the weak spot.** The rules caught 4 of 8 Hinglish rewrites of attacks they catch in English. The misses use words outside our Hinglish and Hindi lists, or English words inside Devanagari. The gateway's other checks still intervened on most of them: Hinglish retention was 0.8, against 1.0 for homoglyph, base64 and paraphrase rewrites (`results/robustness-leakshield.md`, `results/ojaswi/misses-analysis.md`).

3. **Some normal work is interrupted.** 7 of 28 allowed held-out cases got an intervention:
   - 4 because retrieval pulled in an unrelated document holding a fake key or synthetic PII. Relevance ranking was added after this freeze and is not yet measured.
   - 3 because of the detectors: a `test-key-placeholder` value, a model answer that explained an attack, and an email-like address read as a UPI ID.
   
   The fixes are written down but not applied. Nothing was tuned on held-out cases.

4. **No ML classifier in the loop.** The pretrained DeBERTa injection classifier caught paraphrases the rules missed, but it flagged 19 of 110 normal prompts and its scores did not separate attacks from normal work. It is off by default (`results/ojaswi/classifier-check.md`). It is English-only, and fine-tuning on Hinglish and office text is the next step.

5. **Scope boundaries:**
   - Text and Markdown only: no OCR of images or scanned PDFs.
   - Confidential prose is recognised only through labels and registered phrases.
   - Canary markers and 8-word fingerprints catch copying, not every paraphrase; permissions inside retrieval are the real boundary.
   - Content an admin approves does reach the external provider.
   - The organisation-level Groq data-retention setting is still to be confirmed by the account owner.

The test sets were written by the team. They are a frozen team evaluation, not independently blinded evidence.
