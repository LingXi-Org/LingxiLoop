# #297 frozen CNY cost presentation

The configured Pro BGE tariff already equals CNY 0.000070 per 1000 input tokens, with the billing item `pro/baai/bge-m3.online.input-tokens`. The confirmed code gap was the public trace dropping the ledger's captured original-currency amount/rates, followed by a UI formatter that always used `$`.

This change carries only allowlisted captured CNY amounts/rates into the scoped trace. It retains the existing USD ledger/budget fields, never rewrites old rows, and aggregates original currencies separately. Older ordinary BGE identities, missing prices and legacy USD traces remain unchanged. No current rate or FX is used to reconstruct unavailable historical CNY. New pricing snapshots have an explicit catalog version. The UI identifies CNY and shows its captured per-1000-token input rate when a model call is selected.

No model, dimension, index, permission or schema is changed. The configured primary model and native memory/knowledge embedding paths continue to use the existing `OPENAI_EMBEDDING_MODEL`; case variants are not silently substituted as a different billed model. No provider inference/embedding request was made for this work.

## Verification status

- Failure model and failing regression assertions preceded implementation. The initial run reproduced missing captured CNY, missing currency totals and the `$` UI.
- 12 targeted new/existing pricing, scoped-projection, currency rendering and legacy waterfall checks passed.
- Additional owning regression startup initially failed because the direct runner omitted the synthetic `DATABASE_URL`; no failed assertion was represented as passed.
- Initial web typecheck was killed with exit 137 under shared-environment memory pressure. Initial server typecheck identified a test double type cast, corrected before this candidate. Final typechecks remain an integration gate.
- A local HTTP -> isolated PostgreSQL -> native/fallback trace -> official browser test is provided. Execution is queued behind other workers' heavy checks to avoid another memory-pressure failure. Exact-head CI and independent review remain required before merge.

Only synthetic local test inputs and approved public metadata belong in this report; no production conversations, bindings, private traces or credentials are included.
