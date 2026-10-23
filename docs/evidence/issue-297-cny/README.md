# #297 frozen CNY cost presentation

The configured Pro BGE tariff already equals CNY 0.000070 per 1000 input tokens, with the billing item `pro/baai/bge-m3.online.input-tokens`. The confirmed code gap was the public trace dropping the ledger's captured original-currency amount/rates, followed by a UI formatter that always used `$`.

This change carries only allowlisted captured CNY amounts/rates into the scoped trace. It retains the existing USD ledger/budget fields, never rewrites old rows, and aggregates original currencies separately. Older ordinary BGE identities, missing prices and legacy USD traces remain unchanged. No current rate or FX is used to reconstruct unavailable historical CNY. New pricing snapshots have an explicit catalog version. The UI identifies CNY and shows its captured per-1000-token input rate when a model call is selected.

No model, dimension, index, permission or schema is changed. The configured primary model and native memory/knowledge embedding paths continue to use the existing `OPENAI_EMBEDDING_MODEL`; case variants are not silently substituted as a different billed model. No provider inference/embedding request was made for this work.

## Verification status

- Failure model and failing regression assertions preceded implementation. The initial run reproduced missing captured CNY, missing currency totals and the `$` UI.
- 12 targeted new/existing pricing, scoped-projection, currency rendering and legacy waterfall checks passed.
- Additional owning regression startup initially failed because the direct runner omitted the synthetic `DATABASE_URL`; no failed assertion was represented as passed.
- Initial web typecheck was killed with exit 137 under shared-environment memory pressure. Initial server typecheck identified a test double type cast, corrected before this candidate. Final typechecks remain an integration gate.
- Local HTTP -> isolated PostgreSQL -> native/fallback trace integration passed **1/1**. The synthetic 10-token Pro embedding captured CNY **0.0000007**, retained USD **0.0000001** as its budget basis, survived projection/replay, and left historical ledger rows unchanged. A different principal could not read the trace.
- Official `e2e` / `@e2e-dev/web` browser passed **1/1**, run `01a1691f-5753-7b85-b6f6-403130a300e5`, with live/history/replay phases at 390 px. Each phase selected the actual embedding row and asserted CNY cost, the captured **¥0.000070 / 千输入 tokens** tariff, no USD mislabelling, no synthetic private input/key exposure, and no horizontal overflow. Screenshots: [live](001-trace-cny-live.png), [history](002-trace-cny-history.png), [replay](003-trace-cny-replay.png).
- The initial full deploy-contract suite passed 238/239 and identified the new shared module missing from the server image. Adding its runtime COPY also required its owning server/integration CI path filter; both are now included. The affected `production-rag-contract.test.mjs` passes **20/20**, including complete shared imports and future-change CI routing. No release verification condition is relaxed.
- Initial candidate `dd0e4e7750cb575b12d0a5b3bd9700b5e5f991e8` received an independent read-only review with no P1/P2 findings; its web/server CI succeeded while deploy-contract failed as above. A completed-job log download returned HTTP 403 and was stopped without changing access route; local synthetic tests identified the packaging gap. The old CI is not represented as successful. Final candidate CI and delta review remain required before merge.

To reproduce, run `server/src/__integration__/trace-ledger-timing.test.ts` against an isolated local test PostgreSQL database with `ISSUE297_CNY_SNAPSHOTS=.e2e/issue297-cny-snapshots.json`. Then serve `e2e/vite.react-activity.config.ts` and run the official engine for `e2e/web/trace-cny.e2e.ts` using the loopback `E2E_BASE_URL`. The integration uses temporary tables, rolls its transaction back, and sends only a synthetic input to its own local HTTP server.

Only synthetic local test inputs and approved public metadata belong in this report; no production conversations, bindings, private traces or credentials are included.
