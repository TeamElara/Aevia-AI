# LeakShield — Alwaz: access and approvals

Access-control and approval modules for the team plan in `docs/PLAN.md`. The React scaffold is in `apps/web`; its chat/gateway wiring belongs to the other team modules and is not implemented here.

## Reproduce

Install Node.js 22+ and pnpm 11.25.0, then run:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm eval:validate
```

Tests automatically download MongoDB on first run and start an isolated local database, then stop it. No Docker, real provider credentials or external Mongo account is required. Tests use a deterministic simulated provider and explicitly injected scanner callbacks. They verify access and approval boundaries; they do not validate the team's absent PII detector or conversation vault.

For an existing local MongoDB, copy `.env.example`, export its values in your shell, then run `pnpm seed`. Generate independent JWT and fingerprint secrets with `openssl rand -hex 32`; no default secrets are shipped. Set `MONGO_URL` if different from `mongodb://localhost:27017`. Run `node seed/seed.js --tokens` to write one-hour demo JWTs to ignored `seed/tokens.json`. The scripts read shell environment variables; they do not automatically load `.env`.

## Implemented

- Ten synthetic documents matching PLAN §7; two poisoned sources are quarantined.
- Asha employee, Ravi HR, Meera engineering, CEO per-user grant, admin approval role without document bypass.
- Mongo `$text` search and group/per-user ACL predicate before top-k, then fresh ACL/content checks at assembly.
- `external_llm: allow | approval | deny`, eight-word keyed fingerprints and conservative source scanning.
- AES-GCM encrypted in-memory approval queue, ten-minute expiry, metadata/request hash in Mongo and single-use replay with current membership/policy checks.
- Access-service callback integration and Express-compatible routes; optional local ingest classifier.
- Six dev, sixteen held-out and fifteen paraphrase cases using the agreed schema.

Run `pnpm test:report` when deliberately refreshing the measured access report; ordinary tests leave committed results unchanged.

Evidence: [results](results/alwaz/RESULTS.md), [classifier decision](docs/CLASSIFIER-DECISION.md), [handoff](docs/ALWAZ-HANDOFF.md), [eight-slide deck](docs/Alwaz-LeakShield.pptx).

Run `pnpm classifier:spike` separately to download the pinned English classifier and measure Node feasibility. This downloads approximately 713 MB; model weights stay ignored in `.cache`. The classifier is optional and not a substitute for ACLs. The locally quantized variant can be reproduced using `tools/quantize-classifier.py` with Python ONNX dependencies; the normal upstream model supports the default full-precision path.
