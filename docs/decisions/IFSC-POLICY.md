# Decision: IFSC codes are masked, not warned

Status: **decided by Detection (Ojaswi), 15 October 2026. To be applied in Detection v3**, with a new freeze. The final demo stays on `eval-freeze-v2`, where `policy.yaml` has `ifsc: warn`.

## Context

- `apps/gateway/policy.yaml` sets `ifsc: warn`. An IFSC code in a prompt is reported, and then sent to the provider unchanged.
- That is the only provider leak in both frozen runs: H-020 (an IFSC in a sample bank-transfer form) expects masking. Provider-leak flags were 12 → 1 at v1 and at v2, and that 1 is this case.
- An IFSC alone is a public branch code that RBI publishes. In practice it arrives inside payment records next to an account number, a name and an amount. We already mask bank-account numbers, UPI IDs and cards.

## Options

| Option | Provider sees | User sees | Cost |
| --- | --- | --- | --- |
| warn (today) | The real IFSC | The real IFSC | Leaks the branch half of a payment record; H-020 stays a leak |
| **mask** | `[IFSC_xxxx]` token | The real IFSC, restored from the vault | The model cannot reason about the code itself ("which bank is HDFC0001234?") |
| block | Nothing; request stopped | An error | Stops ordinary payment work. Too strict for a public code |
| mask only next to an account/UPI/payment context | Token in payment records, real code elsewhere | Real value | Two code paths; context rules need tuning and can miss |

## Decision

**Mask always** (`ifsc: mask`). Reasons:

1. **Same record, same treatment.** In a transfer form the account number is already masked. Leaving the IFSC in clear still sends the branch half of the record to an external provider.
2. **Masking is reversible.** User-origin values are restored from the conversation vault, so the user's answer is unchanged. The cost is close to zero, unlike block.
3. **False positives are cheap.** The IFSC pattern is strict (4 letters, `0`, 6 alphanumerics), and a wrongly masked code is restored for the user anyway.
4. **Simple to explain and test.** One policy line, no context heuristics. It closes the only provider leak in the frozen runs.

The trade-off we accept: questions about an IFSC code itself lose that ability, because the model sees a token. The v3 dev set gets cases of this kind ("which bank and branch is this IFSC?") so the effect is measured, not assumed. If it hurts too much, the fallback is option 4 (context-dependent masking).

## What changes in v3 (not before the final demo)

- `apps/gateway/policy.yaml`: `ifsc: mask`. This is a one-line change in the policy owner's file (Mahatva), in a reviewed PR.
- New dev cases:
  - IFSC in a payment record → mask, restored.
  - IFSC lookup question → measured.
  - IFSC lookalikes (product codes, ticket ids) → no finding.
- Measure on dev only, then cut `eval-freeze-v3` and run fresh. `eval-freeze-v2` and its results stay as they are.
- Judge answer until then: "The one leak in our frozen run is an IFSC code. Our frozen policy warns on IFSC because it is a public branch code. We have decided to mask it in the next version, since it sits next to the account number we already mask."
