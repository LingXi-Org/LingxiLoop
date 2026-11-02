# #633 candidate and release handoff

This is a code candidate, not a claim of recovered production retrieval or a deployed release. The sole integrator must establish the retained index contract/generation and the original run's exact budget failure before closing #633. No production writes, reruns, credential changes, security-policy changes, corpus resets or index migrations were performed by this task.

## Scope and source

Initial base: `04974b12`; rebased onto `e36a1376` after the independent #631 Slides math merge, preserving that owner’s changes. Issue #633 and every comment were reread; author `lyyzka`, open, no assigned implementation. The product continues to pin formal `@lyyzka/lingxios` 3.8.21. Local installed dependencies initially contained 3.8.16; the actual registry 3.8.21 archive was fetched with existing package authentication and checked against the existing lock's SHA-512 integrity before validation. No package manifest/lock or runtime source was substituted.

Changed: Notebook deployment wiring and a read-only contract preflight; root execution-budget defaults; independently settled hybrid retrieval and failure classification; saved-work/continuation wording; safe budget-failure presentation and replay. Existing tool concurrency and teacher/workspace policies are retained. Shared files touched include `agent-runtime/runtime.ts`, `assistant-transport.ts`, `public-events.ts`, `terminal-feedback.ts`, and chat `terminal-presentation.ts` / `AssistantMessageActions.tsx`; the integrator should preserve concurrent changes there.

## Production read-only observations

- The issue's named run was reread through the existing authenticated LingxiLoop MCP, without executing it. It remains `partial`, delivered, execution 182286.087 ms, calls 12, measured/estimated totals input 723741 + output 25027, one estimated call, costMicros 235380, and the combined budget gap. There is no `runtimeFailure` in the public diagnostics. These numbers do **not** prove a time, token, cost or reservation dimension.
- The existing HTTPS backend route `/internal/open-notebook/v1/embeddings` returned 401 to an unauthenticated, empty request. It reaches the existing authenticated handler; frontend routing/CSP/authentication were not changed.
- Read-only Sigillo lookups: `OPENAI_EMBEDDING_MODEL=Pro/BAAI/bge-m3`; legacy `NOTEBOOK_EMBEDDING_MODEL=BAAI/bge-m3`. The four `AGENT_OS_MAX_*` budget keys and `NOTEBOOK_EMBEDDING_BASE_URL` were absent (404). Therefore, absent subsequent configuration changes, the reviewed compose defaults will determine new workers' budgets.
- Production SSH read-only inspection of the budget/call/hold rows was attempted at `182.254.156.84:22` and failed with `Connection refused`. No remote command executed. Existing authenticated HTTPS/MCP reads worked. No alternate network route or changed security settings were used.

## Embedding and index gate

Notebook now uses the existing authenticated backend HTTPS endpoint, configurable through `NOTEBOOK_EMBEDDING_BASE_URL`, and the same `OPENAI_EMBEDDING_MODEL` setting as both API/worker slots. Legacy `NOTEBOOK_EMBEDDING_MODEL` is no longer consumed. The bearer credential, company validation and shared LLM ledger stay unchanged.

The new deployment preflight reads schema, model ID, model, exact endpoint, dimensions and aggregate invalid dimensions using the running Notebook's existing database identity. It does not invoke the startup resolver, which may activate a sealed generation. It refuses unknown/pre-contract embeddings and model/endpoint mismatches before backend configuration writes, runtime CAS, Worker drain or Notebook restart. Equal dimensions alone never authorize a model rename. An existing active shadow generation must have matching sealed plan/verification and product-gate receipts. No rows are relabelled, deleted or rebuilt.

The old production contract/model/dimensions/generation have **not** been inspected from this environment. If the contract is the legacy model/endpoint, an ordinary deploy of this candidate is expected to stop safely at preflight. The integrator must first use the existing bounded shadow-generation workflow (plan → fence → separate target backfill → verify → activate → product-lock finish), with the corrected existing backend as the target origin, and preserve the source database/originals. `generation.py` resolves the sealed target's exact `/shadow` endpoint. Do not simply edit stored contract strings or use ingestion retry to disguise a model migration. No migration execution is authorized to this developer task.

## Effective new-root budgets

| Dimension | Prior product/compose default | Candidate product and both slots | Change |
| --- | ---: | ---: | ---: |
| Model calls, all attempts | 128 | 512 | 4× |
| Total tokens, including next-call reservations | 1,000,000 | 8,000,000 | 8× |
| Cost, USD micros | 10,000,000 ($10) | 50,000,000 ($50) | 5× |
| Cumulative root execution | 1,800,000 ms (30 min) | 7,200,000 ms (2 h) | 4× |

The same public `modelBudget` options are supplied to control and worker. Pricing, reservation/settlement, bounded three-attempt provider recovery, 180-second deployed per-logical-request timeout, per-tool limits, protocol-repair and no-progress bounds are unchanged. A per-request provider deadline is distinct from root cumulative execution. Explicit positive integer environment overrides still work, including intentional low-budget qualification; zero/infinite/fractional overrides are rejected. Existing root budget rows are immutable under the SDK's admission behavior and retain their original limits; a human continuation message creates a new request/root and first reads saved work rather than recreating it.

The formal SDK admits `settled root usage + next input/output reservation + other held work`, not merely the UI's settled token sum. It uses conservative wire input estimates and settles measured calls afterwards. Its native default limits remain 128 / 1M / $10 / 30min, but the product passes explicit public overrides; there is no dependency upgrade or private runtime adapter here. The original root's budget rows, reserved amounts, holds and current internal `model.failed.budgetLimit` event still need operator inspection. Do not call the original 182-second result a 180-second timeout.

## Deterministic verification

- Focused unit/component coverage: retrieval retention and privacy, source outcomes, finite budget overrides, safe structured budget dimensions, current/stale saved-work receipts, actual conversation rendering, and projection replay. 54 tests passed across the named affected files.
- Deployment tests: Notebook model alignment, exact contract refusal, sealed generation acceptance, and both rendered app slots: 5 passed. Existing production shared-import graph and Worker barrier checks passed; the new shared helper is explicitly copied into the server image and included in CI's shared inputs.
- `server:typecheck`, web `typecheck`, changed-source Biome lint, `node --check deploy/cli.mjs`, Python compile and `git diff --check` passed on the candidate (CI remains authoritative for the pushed SHA).
- Existing knowledge vertical slice: 20 integration tests passed, including real PostgreSQL tenant/private/course filtering, exclusions, changed/revoked source access and retained original formats.
- New real public Worker + product Slides tools + PostgreSQL ledger regression: two scenarios, 10 saved pages each. A **synthetic provider** with 300,000 input + 16,384 output admission and 90,001 measured tokens per call reproduces the old limit: after 8 calls / 720,008 settled tokens, the next 316,384-token reservation is rejected as `tokens`; the 10 pages remain stored. Expanded limits permit 10 calls / 900,010 tokens, save → check unsupported table style → repair against sha256 → recheck with 10 slides and 0 problems → successful final answer and IM delivery. Settled token and cost counters equal call receipts; reservations are not double-counted. This is not a real model-quality or production end-to-end acceptance.

Owning commands:

```sh
node --test deploy/notebook-embedding.test.mjs scripts/production-model-contract.test.mjs
node --test --test-name-pattern='complete shared runtime import graph|production stops both' scripts/production-rag-contract.test.mjs
npm run server:typecheck
npm run typecheck
# Unit/component files: knowledge-retrieval, knowledge-activity, model-budget,
# public-events, run-activity-projection, knowledgeSearch,
# terminal-presentation, ConversationMessage (Node/tsx's existing test runner).
npm run test:integration -- --file runtime-artifact-budget.test.ts --file knowledge-vertical-slice.test.ts
```

The integration target was a newly created isolated local `lingxiloop_issue633_test` database, bootstrapped through the existing verified formal runtime chain, with a dedicated local Redis; production database and original deck were not used.

Failures retained: the old `Promise.all` regression lost text on vector 404; old deployment defaults failed the new budget contract check. First local runs had incomplete test environment, then stale installed SDK typings, both corrected. The stronger real-worker test also exposed loss of a structured failure reason during terminal snapshot replay; the identity-bound reason now survives final state reads. Initial image graph checking caught the new shared helper missing from Docker COPY; it is now included. The first CI deployment-contract job also found two legacy assertions still requiring the broken frontend embedding origin; the assertions were updated to the corrected backend/shared-model contract. These failures are not reported as passed runs.

## Remaining production / upstream boundaries

1. Establish the actual retained index contract and generation before migration/cutover; verify both old and newly uploaded sources through authenticated, billed embedding, text/vector retrieval, reading and citations.
2. Read the original root's frozen limits, next rejected reservation, cumulative attempts/holds and internal budget failure diagnostic. No exact original trigger is claimed here.
3. Formal 3.8.21's public `readEvents` filters internal `model.failed`, and `readDiagnostics` does not expose its budget dimension. Its public `run.failed` event also lacks request/fence metadata. Current first-unsteered-attempt failures can be identified from public state; later unfenced legacy terminal events remain generic. A fully general operator/public dimension reader for partial and revised/retried runs requires a formal upstream API/release, not a private product SQL adapter.
4. Real provider/production 10-page completion, original-deck continuation, browser refresh/history/live acceptance, independent review, CI and deployment must be completed by the parent/integrator. The synthetic fixture is not a substitute for those gates. The original #633 should remain open until those acceptance items are satisfied.
