# Blind held-out v3 commitment

Mahatva has authored 60 fresh synthetic cases and sequestered their content outside Git, GitHub and the development/browser workspace, under a current-user Windows ACL. Only the counts and commitment in `results/mahatva/heldout-v3-commitment.json` are public. Do not request the case content during detector or policy development.

The committed JSONL SHA-256 is:

`d13724404e9b5c104f87469e80a0af69396756bd0a645e45e483f941cfd558e2`

The set passed schema validation and contains no exact prompt duplicates from the four existing public evaluation sets. It has made **zero detector or model queries** and has no performance or safety score yet. It is blind to detector development through sequestering, not an independent external benchmark: the author knows the existing system, and access cases reuse public synthetic document fixtures. Declared leak assertions do not prove the absence of semantic or paraphrased disclosures.

## Release and evaluation procedure

1. After the final demo, agree the v3 contract, including external-provider behavior and the proposed IFSC mask policy. The current IFSC policy remains warn; this draft changes no production behavior.
2. Freeze the candidate code, policy, thresholds, provider/model and evaluation runner before revealing the cases. Record their immutable revisions and configuration without credentials.
3. Verify the private JSONL against the public SHA-256 before the first run. Preserve the committed bytes; document any contract or annotation defect separately rather than silently editing the set.
4. Evaluate the frozen candidate once under the agreed contract. Keep raw prompts, values and model text private; publish only safe aggregate metrics and per-case identifiers/booleans.
5. After disclosure or use in debugging/tuning, treat this set as consumed. Subsequent changes require a new untouched test set for another blind claim.

Existing frozen v1/v2 evidence, datasets and tags remain unchanged. This commitment is preparation for a future evaluation, not a replacement headline result.
