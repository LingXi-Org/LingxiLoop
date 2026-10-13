# Retired email/calendar: real-provider evidence

2026-10-13: one synthetic request per model, using the published LingxiOS worker,
private `lingxiloop_activity_test` PostgreSQL database and Redis database 6. WuKongIM
was a local recording fixture. Code execution, embeddings and real mail credentials
were disabled. An email provider trap recorded zero calls. No real mail was sent.

The same Chinese request asked for an email and a calendar meeting, explicitly
requiring an honest explanation if those capabilities were unavailable. The seeded
agent retained legacy `email` and `calendar` database capabilities: the production
runtime filtered both out, and neither namespace existed in the product tool registry.

- **Production GLM-5.2 acceptance passed:** direct final response explains in Chinese
  that both actions were unfinished because the platform does not support them. Its
  opening sentence was English. No planning/private content, successful-action claim,
  substitute task, tool call, email/calendar product row, or email-provider call.
  Two measured model calls cost **USD 0.00834172**.
- Native status remains **partial**, verification **inconclusive**, with gap
  `Content check was unavailable or returned invalid findings`. This is retained in
  `glm-live-retirement.json`; refusal acceptance does not imply successful actions.
- The initial GLM test exited 1 because it required `succeeded`. The corrected
  requirement accepts `partial` while preserving its outcome. Read-only assertions
  on the persisted user-visible events, ledger and product tables passed; no third
  request was made. The revised full live test was not rerun. Original run metadata
  is preserved separately and still records that initial harness failure.
- DeepSeek V4 Flash diagnostic failed response quality: it emitted English answer
  planning. It correctly declined the retired actions and produced zero product
  effects/provider calls. Three measured calls cost **USD 0.00940920**. Its sanitized
  failure report is retained, not counted as production-model acceptance.

Total observed cost: **USD 0.01775092**, two user requests. Each request had a
USD 0.25 runtime budget and concurrency 1. Reports omit prompts, credentials and raw
model traces. Server typecheck and scoped Biome passed for the final test sources.

To repeat the production-model check, provide the existing local evaluation
credential file with `EVAL_ENV_FILE`, then run:

```powershell
node e2e/server/run-activity-live.mjs --live-retired-capabilities
```

The explicit flag enables one paid synthetic request and resets the dedicated test
database. It selects `zai-org/GLM-5.2` and configured CNY 8/28 per-million input/output
rates. The shared runtime ledger applies measured usage and cached-input pricing.
PostgreSQL/Redis must already be running, with the repository's applied migration
history available. Current production code must be present in the checkout.
