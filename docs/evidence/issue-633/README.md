# #633 / #637 independent budget and retrieval release

## Final scope

Based on main `8a8db8b5`, inheriting #641/#642 as one unchanged read-only observation implementation. This candidate independently ships approved finite new-root budgets, independent text/vector retrieval settlement and safe degraded results, cancellation and authorization rechecks, and partial/saved-work presentation and continuation. The formal SDK remains pinned to `@lyyzka/lingxios` 3.8.21; native admission, reservation, actual usage settlement, retry/tool/step bounds and original root immutability remain intact.

The user explicitly approved 512 model calls / 8M total tokens / $50 / two hours for **new roots** on 2026-11-02 at 11:58 UTC, after the explanation that this is not a global spending cap and multiple roots can accumulate cost. Old roots retain their frozen limits. No old root is mutated or retried by this task.

Notebook compose/embedding endpoint overrides, endpoint helpers and the global Notebook deployment preflight have been removed from this release. Those files match main. No preflight bypass flag exists. The frontend and backend routing/security code, existing bearer/company/model/input checks and provider ledger are unchanged. This independent release no longer waits for an embedding access-boundary decision. The parent-designated sole integrator owns review, merge and production deployment.

## Established read-only facts and limits

The integrator's [successful observation 41440171225](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41440171225) is retained in [production-observation-41440171225.json](production-observation-41440171225.json). This developer task only read the existing Actions log; it did not invoke production observation or embeddings. Observation-only main was `8a8db8b5`; the actual product remained `fcfa3b71` at that observation.

| View | Model | Dimensions | Chunks | Invalid dimensions |
| --- | --- | ---: | ---: | ---: |
| Retained `open_notebook` | `BAAI/bge-m3` | 1024 | 35 | 0 |
| Active `open_notebook_pro_bge_m3_v1` | `Pro/BAAI/bge-m3` | 1024 | 37 | 0 |

The active pointer was stable, phase active, revision 1, with exact sealed endpoint `https://loop.lingxilearn.cn/internal/open-notebook/v1/shadow`. The Docker-configured legacy model is resolved by the existing generation coordinator to the active Pro model; dimensions alone do not authorize changing either model. No model, index, dimension, generation, original data or seal is changed by #637.

Both observed workers used SDK 3.8.21 and configured limits 128 / 1M / $10 / 30min. These are current environment values, not the old root's frozen budget. Original run requestVersion 1 / fence 1 remained partial and publicly reported the combined budget-exhaustion gap: calls 12, pending 0, estimated 1, input 723741, output 25027 and costMicros 235380. The public SDK explicitly cannot expose frozen root limits or the exact partial rejection/reservation dimension; both remain unknown. Neither the 182286.087ms runtime nor usage totals determine a trigger. The earlier unavailable reader response retained no HTTP status and is not retrospectively called 406.

## Separate embedding route proposal — analysis only, approval pending

The six-stage endpoint-metadata migration proposal is no longer the chosen next step. The current frontend denies all `/internal`, while the existing backend already has the exact Pro shadow embedding handler with unchanged bearer authentication, company/model/input validation and native ledger accounting. A minimal follow-up could passthrough **only main-site POST `/internal/open-notebook/v1/shadow/embeddings`** to that existing backend path, preserving the original sealed endpoint and both indexes. Every other internal path/method and artifact/editor origin would remain denied.

This changes the existing frontend access boundary. The parent is requesting specific user approval; broad issue/deployment authority and reviewer inference do not substitute for it. No implementation, route test claiming the exception exists, merge, deployment, new credential, token forwarding scheme, provider call or index migration has been performed for this proposal. Notebook/route code remains byte-identical to main.

After that approval, the separate qualification plan is:

1. Match the exact main hostname, literal normalized path and POST method before allowing this one passthrough. Reject other hosts, artifact/editor origins, GET/HEAD/OPTIONS/PUT/DELETE, path suffixes/prefixes, alternate internal paths and encoded/case/slash variants unless explicitly authorized. Existing loop protection and independent-backend validation remain effective. Test with a local fake fetcher, never a production model.
2. Preserve request body, existing bearer/company headers and backend response/status/stream semantics without generating credentials, signing a different principal, caching embedding bodies or logging secrets. Do not introduce a generic internal proxy, redirects or user-selectable destination. Keep the original backend `/internal/open-notebook/v1/shadow/embeddings` handler and authorization code unchanged.
3. In local transport/backend tests, verify missing/wrong bearer returns 401, invalid company/model/input fails before any provider call, legitimate Pro requests reach that same handler exactly once and retain company-scoped native ledger behavior. Use a synthetic provider/isolated ledger; no paid model qualification is authorized here.
4. Keep broad `/internal` denial and artifact-origin tests green; confirm Notebook logical endpoint/model/index/generation/receipts remain byte-identical. CI and independent review must precede the sole integrator's separately authorized release. A live charged embedding/retrieval acceptance run needs its own bounded authority.

If approval is absent, continue shipping only independent budget/degradation fixes. Do not silently implement this exception or return to contract relabelling/backfill as a shortcut.

## Verification and handoff

Existing focused regression coverage includes vector failure retaining text, text failure retaining vectors, safe failure projection without upstream/private content, both-search failure, programming/auth failures propagating, post-search reader revocation during degraded results, cancellation, finite budget overrides, current/stale saved-work receipts, conversation rendering and history replay.

Earlier actual isolated PostgreSQL + public Worker + product Slides tools scenarios use a **synthetic provider**, with conservative 316384-token next-call admission and measured 90001 tokens per model call. The old token limit stops after eight calls / 720008 settled tokens while preserving ten saved pages; approved expanded budgets finish save → check → repair → recheck → final answer, ten calls / 900010 tokens and zero remaining checker problems. Root usage/cost equals actual settled call receipts, with no double-counted reservations. These are deterministic admission/artifact/ledger qualifications, not real model quality or proof of the original run's exact rejection. Knowledge vertical-slice integration covers current tenant/private/course visibility, excluded/revoked sources and original formats.

On the narrowed candidate, 54 focused server/web tests, 30 inherited deployment/model/CI-scope checks and four targeted production RAG/import/Worker-barrier contracts passed locally. The final narrowed SHA still needs its own green CI after removal of the Notebook deployment coupling. Previous candidate CI passed but is not substituted for the final head. The new inverse-search and degraded-revocation cases run with local mocks. Owning checks include changed server/web unit tests, deployment/model contracts, CI scope, server/web typechecks and selected native budget/knowledge integration through existing CI. No additional model/provider call, production read, deployment, security/configuration change, corpus rewrite or original-deck mutation was made by this task.

After green CI and independent review, the unique integrator can release this candidate without the embedding proposal. Keep #633 open for the separately approved route repair and its eventual bounded end-to-end acceptance; saved partial work and the original budget-trigger unknown remain accurately represented.
