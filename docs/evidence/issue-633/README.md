# #633 candidate and release handoff

This is a code candidate, not a claim of recovered production retrieval or a deployed release. The sole integrator must establish the retained index contract/generation and the original run's exact budget failure before closing #633. No production writes, reruns, credential changes, security-policy changes, corpus resets or index migrations were performed by this task.

## Scope and source

Initial base: `04974b12`; now rebased onto `8a8db8b5` including #641/#642 and the independent product fixes. The observation implementation is inherited from #641, with no duplicate observer changes in #637. #642 owns the Accept-header correction; its merged implementation is inherited without a duplicate fix. Issue #633 and every comment were reread; author `lyyzka`, open, no assigned implementation. The product continues to pin formal `@lyyzka/lingxios` 3.8.21. Local installed dependencies initially contained 3.8.16; the actual registry 3.8.21 archive was fetched with existing package authentication and checked against the existing lock's SHA-512 integrity before validation. No package manifest/lock or runtime source was substituted.

Changed: a guarded Notebook endpoint override preserving existing defaults and a read-only contract preflight; root execution-budget defaults; independently settled hybrid retrieval and failure classification; saved-work/continuation wording; safe budget-failure presentation and replay. Existing tool concurrency and teacher/workspace policies are retained. Shared files touched include `agent-runtime/runtime.ts`, `assistant-transport.ts`, `public-events.ts`, `terminal-feedback.ts`, and chat `terminal-presentation.ts` / `AssistantMessageActions.tsx`; the integrator should preserve concurrent changes there.

## Production read-only observations

- The issue's named run was reread through the existing authenticated LingxiLoop MCP, without executing it. It remains `partial`, delivered, execution 182286.087 ms, calls 12, measured/estimated totals input 723741 + output 25027, one estimated call, costMicros 235380, and the combined budget gap. There is no `runtimeFailure` in the public diagnostics. These numbers do **not** prove a time, token, cost or reservation dimension.
- The existing HTTPS backend route `/internal/open-notebook/v1/embeddings` returned 401 to an unauthenticated, empty request. It reaches the existing authenticated handler; frontend routing/CSP/authentication were not changed.
- Read-only Sigillo lookups: `OPENAI_EMBEDDING_MODEL=Pro/BAAI/bge-m3`; legacy `NOTEBOOK_EMBEDDING_MODEL=BAAI/bge-m3`. The four `AGENT_OS_MAX_*` budget keys and `NOTEBOOK_EMBEDDING_BASE_URL` were absent (404). Therefore, absent subsequent configuration changes, the reviewed compose defaults will determine new workers' budgets.
- Production SSH read-only inspection of the budget/call/hold rows was attempted at `182.254.156.84:22` and failed with `Connection refused`. No remote command executed. Existing authenticated HTTPS/MCP reads worked. No alternate network route or changed security settings were used.

## Embedding and index gate

The integrator's [read-only Actions run 41440171225](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41440171225) now establishes the retained and active metadata. The exact bounded output is retained in [production-observation-41440171225.json](production-observation-41440171225.json); it contains no source text, vectors, prompts or credentials.

| View | Model | Dimensions | Chunks | Invalid dimensions |
| --- | --- | ---: | ---: | ---: |
| Retained `open_notebook` | `BAAI/bge-m3` | 1024 | 35 | 0 |
| Active `open_notebook_pro_bge_m3_v1` | `Pro/BAAI/bge-m3` | 1024 | 37 | 0 |

The active pointer is stable, phase `active`, revision 1. Its exact stored endpoint is **`https://loop.lingxilearn.cn/internal/open-notebook/v1/shadow`**. The configured Docker model remains legacy `BAAI/bge-m3`; `generation.py` resolves the active sealed Pro generation before both Notebook processes start. Equal dimensions do not make the old and active models interchangeable.

The original candidate's automatic backend/shared-model defaults have been withdrawn. Notebook retains its configured model and public-origin base by default. A future explicit `NOTEBOOK_EMBEDDING_BASE_URL` override can select a reviewed endpoint; setting it does not rewrite or approve a contract. The current preflight rejects the denied frontend transport even when its contract matches, and separately rejects a backend override against the existing frontend-sealed pointer. The regression uses the actual observation and verifies refusal does not mutate it. Deployment remains blocked.

The exact endpoint is checked by `generation.py`, runtime startup/readiness and the stored contract. The existing shadow verification also seals it into the original plan. Accepting both hosts, redirecting requests silently, editing a contract URL or resealing a changed manifest under the old hashes would bypass that evidence. None is implemented. Frontend `/internal` denial, existing backend bearer/company checks and the shared ledger are unchanged.

### Endpoint-only migration proposal — decision required, not implemented

A safe solution must retain both databases, the active Pro model, dimensions and generation; a fresh backfill or switching back to the legacy model is outside this scope. The existing shadow coordinator has **no endpoint-only relocation operation**. Its backfill/activate/rollback commands do not authorize relabelling the active generation. No executable production migration command is provided by this candidate.

The proposed additional operation is an **explicit, immutable transport-binding receipt** for the existing logical endpoint, rather than changing that original contract or its sealed plan. It would route only this bound generation's HTTP requests to the existing authenticated backend `/internal/open-notebook/v1/shadow`; generic endpoint aliases, frontend forwarding and authentication changes remain prohibited. This is a design proposal requiring parent review plus a separate implementation/qualification before any production write:

1. Reobserve the exact active database, stable pointer/revision and complete plan/verification/product-gate hashes. Collect a bounded internal before-state digest of active vectors and product bindings under existing identities; export only aggregate counts and hashes. Counts 35/37 above are observations, not hard-coded migration assumptions. Verify both API slots still use the same Pro provider/model and shared ledger. Do not call a model to qualify this step.
2. Qualify the proposed reader/operator locally against synthetic HTTP and isolated database fixtures. The receipt must bind namespace, unchanged active database, model/model ID `Pro/BAAI/bge-m3`, dimensions 1024, old logical endpoint, fixed backend transport, all three retained hashes and expected pointer revision. Tests must prove original contract/plan/vector digests stay unchanged, bearer and company checks still apply, all requests enter the same billed backend handler, arbitrary mappings fail closed, and stale/missing receipts cannot be used. No such receipt or reader is yet implemented.
3. Obtain approval for this exact metadata/configuration transition. Enter the existing product-lock maintenance barrier, drain both API/Worker producers and stop Notebook API/worker consumers. Fence the active generation using a reviewed CAS against the captured revision/hashes. Preserve the retained legacy database and its fence; do not delete or re-ingest anything.
4. A reviewed operator would append the transport-binding receipt and a recovery journal, then CAS the control revision to the receipt-bound revision without changing the active database, model, dimensions or original hashes. Cross-database writes require an explicit prepared/committed recovery protocol; do not describe them as one atomic transaction. An uncertain acknowledgement remains fenced for read-only inspection, with no blind replay. No source/vector/contract rows are updated.
5. Start only readers that validate the binding and both old seals before selecting the backend transport, under the unchanged credential/company/ledger path. Reobserve matching receipt/revision, original vector digests and both process readiness. Reopen producers only after the exact observation confirms the committed state. Current #637 intentionally cannot pass this future binding gate; that code must be separately implemented and reviewed. A charged query/vector/source acceptance run needs separate authority and is not performed here.
6. Before commit, rollback means CAS-abort only the prepared binding and restore the exact source pointer/configuration after proving no target commit occurred. After commit, keep the binding history append-only; a separately reviewed CAS reversal and reader rollback under the same drain/fence barrier must restore the captured metadata/configuration, preserving all vectors and originals. The old frontend endpoint is known broken, so reverting to it restores the prior state, **not healthy vector retrieval**. Unknown outcomes stay fenced. Never invoke shadow rollback to the legacy model, reset the index, delete a receipt or overwrite the sealed plan.

The parent may reject or revise this proposal. Until an approved, qualified endpoint-only operation exists, the honest outcome is a blocked route correction, with working text degradation in the candidate; the index must not be relabelled to make deployment pass.

## Effective new-root budgets

**Pending explicit numerical user approval.** These are per-new-root limits, not a global spending cap; multiple roots can accumulate expense. Do not merge/deploy this candidate while that approval is outstanding.

| Dimension | Prior product/compose default | Candidate product and both slots | Change |
| --- | ---: | ---: | ---: |
| Model calls, all attempts | 128 | 512 | 4× |
| Total tokens, including next-call reservations | 1,000,000 | 8,000,000 | 8× |
| Cost, USD micros | 10,000,000 ($10) | 50,000,000 ($50) | 5× |
| Cumulative root execution | 1,800,000 ms (30 min) | 7,200,000 ms (2 h) | 4× |

The same public `modelBudget` options are supplied to control and worker. Pricing, reservation/settlement, bounded three-attempt provider recovery, 180-second deployed per-logical-request timeout, per-tool limits, protocol-repair and no-progress bounds are unchanged. A per-request provider deadline is distinct from root cumulative execution. Explicit positive integer environment overrides still work, including intentional low-budget qualification; zero/infinite/fractional overrides are rejected. Existing root budget rows are immutable under the SDK's admission behavior and retain their original limits; a human continuation message creates a new request/root and first reads saved work rather than recreating it.

The formal SDK admits `settled root usage + next input/output reservation + other held work`, not merely the UI's settled token sum. It uses conservative wire input estimates and settles measured calls afterwards. Its native default limits remain 128 / 1M / $10 / 30min, but the product passes explicit public overrides; there is no dependency upgrade or private runtime adapter here. Both workers were observed on 128 calls / 1M tokens / $10 / 30min, but those current environment values do not establish the original root's frozen limits. The earlier run 41437751503 returned `public_reader_unavailable` without retaining an HTTP status; no 406 or other specific transport cause is inferred for it. After the independent #642 Accept fix, run 41440171225 returned all four views successfully: requestVersion 1, fence 1, lifecycle partial and the reported combined budget gap; calls 12, pending 0, estimated 1, input 723741, output 25027 and costMicros 235380. The public reader explicitly reports both frozenRootLimits and trigger as unknown. Current worker configuration and settled counters do not determine either value. The original root's frozen budget, reserved amounts, holds and exact rejection remain unknown under the current public API. Do not call the original 182-second result a 180-second timeout.

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

1. The retained/active metadata is now established; obtain a parent decision and separate implementation/qualification for the endpoint-only binding proposal above. No model switch, reindex or endpoint relabelling is authorized. Production retrieval remains unrecovered. Charged end-to-end acceptance remains separate.
2. Read the original root's frozen limits, next rejected reservation, cumulative attempts/holds and internal budget failure diagnostic. No exact original trigger is claimed here.
3. Formal 3.8.21's public `readEvents` filters internal `model.failed`, and `readDiagnostics` does not expose its budget dimension. Its public `run.failed` event also lacks request/fence metadata. Current first-unsteered-attempt failures can be identified from public state; later unfenced legacy terminal events remain generic. A fully general operator/public dimension reader for partial and revised/retried runs requires a formal upstream API/release, not a private product SQL adapter.
4. Real provider/production 10-page completion, original-deck continuation, browser refresh/history/live acceptance, independent review, CI and deployment must be completed by the parent/integrator. The synthetic fixture is not a substitute for those gates. The original #633 should remain open until those acceptance items are satisfied.

## Follow-up verification status

The new production-observation regression first failed against the automatic-backend candidate, then passed after preserving defaults and adding the explicit route gate. Six Notebook/rendered-model checks and two focused production RAG environment contracts passed locally. Prior test counts above belong to their earlier candidate SHAs; the rebased final SHA must have its own green CI. This follow-up has made no production writes and no model calls. It only reread the already authorized Actions observation log.

The successful follow-up observation was run by the integrator on observation-only main `8a8db8b5` after #641/#642 were merged with `[skip deploy]`; the actual product remained `fcfa3b71`. This task only reread its existing Actions log. No embedding request, new root, model call or index/configuration mutation was made.
