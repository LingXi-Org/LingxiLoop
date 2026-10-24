# #371 unit-test pruning evidence

Baseline: `190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9`.
Scope: test files only; no runtime, authentication, schema, dependency, browser fixture, or production configuration changes.

## Failure model considered before deletion

- A spelling-based source assertion can keep passing while the named function is unused, or fail during a behavior-preserving refactor.
- Removing a weak guard must not be represented as proving all its behavior elsewhere. Keep authorization, replay, cross-tenant isolation, durable state, and stream/recovery tests. Where the only located guard protects a distinct security boundary, defer removal.
- A deleted default test must be removed from the runner list; it must not turn a selected list into an implicit full run or zero-test success.
- Browser/integration mappings below identify retained stronger owners; they are not claims that those entire suites were rerun by this deletion-only subtask.

## Deleted files (5 files, 8 cases; plus one obsolete case merged below)

| File | Cases | Why remove | Retained behavior owners and limits |
|---|---:|---|---|
| `server/src/__tests__/api-module-boundaries.test.ts` | 1 | Only matches router/middleware function names, `timingSafeEqual`, and a textual absence of `req.body.isAdmin`. It does not exercise a request or socket. | `server/src/__tests__/gateway-auth.test.ts` executes HMAC subject/method/path/freshness, signed nonce replay and registration body binding; `server/src/__integration__/identity-vertical-slice.test.ts` exercises actual registration authorization/transactionality; `server/src/__integration__/permission-resolver.test.ts` owns real database tenant/role/entitlement boundaries; `server/src/__tests__/document-collaboration.test.ts` preserves tenant room rejection, fanout and failed-persistence/replay behavior. These are not a new full WebSocket boundary E2E claim. |
| `server/src/__tests__/context-threads-architecture.test.ts` | 1 | Legacy M9 architecture labels and names of helpers/routes/contracts are implementation-presence checks. | `server/src/__integration__/conversations.test.ts` executes learning-context reuse and distinct teacher context via HTTP, plus foreign/read-only project denial and invalid participant rejection. Runtime contracts remain typechecked. |
| `server/src/__tests__/enterprise-governance.test.ts` | 1 | Only regex-matches schema literals, maximum values and router verbs. | `server/src/__integration__/enterprise-governance.test.ts` creates tenant-scoped hierarchy, checks idempotent replay/foreign parent rejection, and executes revision conflicts plus durable events. Exact regex spelling/absence-of-verb assertions are intentionally not retained. |
| `src/lib/workspaceConversationScope.test.ts` | 1 | Enforces a particular store-reset call sequence, contradicting its own comment that cross-project behavior is browser-covered. | `e2e/web/navigation.e2e.ts` retains cross-project back/forward history, invalid/deleted workspace, stale/current authorization and live-update behavior; `src/api/core/http.test.ts` retains current-versus-stale session rejection. |
| `src/features/settings/settingsDialog.test.ts` | 4 | Source-shape assertions for focus, labels, account calls, invitation rendering and error mapping; no DOM event or network request is exercised. | Official `e2e/web/workspace.e2e.ts` checks settings tabs, persisted appearance and actual focus restoration (desktop/mobile); `e2e/web/auth.e2e.ts` checks unauthenticated invitation/auth rendering; `e2e/web/connection-recovery.e2e.ts` checks logout/sign-in race; `src/api/core/http.test.ts` retains auth rejection behavior. Individual source spelling and all-component label presence are intentionally removed, not described as newly browser-verified. |

Default runner entries removed by the parent: `server/src/__tests__/api-module-boundaries.test.ts` and `src/features/settings/settingsDialog.test.ts` (5 default cases across 2 file processes). The other 3 files were not in the baseline default unit runner. This subtask does not claim a 3–5 minute CI target from these small removals alone.

## Explicitly retained

- `server/src/__tests__/im-read-receipts.test.ts`: retained all four cases. The narrow read-receipt recipient/fanout guard did not have a demonstrated equivalent behavior test in this scan; do not replace evidence with a loosely related test name.
- `server/src/__tests__/process-lifecycle.test.ts`: retained lifecycle order/idempotent stop/failure shutdown behavior and deployment guards.
- `server/src/__tests__/knowledge-deployment.test.ts`: keep the existing R2 exposure and engine-health cases. The obsolete Agent OS case is merged as detailed below; all still-relevant knowledge-network assertions remain.
- All model, permission, idempotency, stream identity/history, unknown-effect and recovery behavior tests remain untouched by this subtask.

## Validation

`unit-pruning-before.json` and `unit-pruning-before.log` record running the exact five original source-only files before deletion. `unit-pruning-retained.json` and `unit-pruning-retained.log` record a focused run of retained authentication, document isolation/recovery and current/stale session behavior; no live model/production/database request is needed for that run. All timings are local selected-test measurements, not Actions job timings.

## Obsolete architecture case merged (1 fewer case, no whole-file deletion)

`server/src/__tests__/knowledge-deployment.test.ts` previously required an `agent-os` Compose service that the baseline has retired. The baseline selected run was 2 pass / 1 fail (`knowledge-deployment-before.log`): the failure is precisely `agent-os service boundary is missing`, not an observed current network exposure. `AGENTS.md` forbids restoring the old runtime; the retained deployment contract `scripts/production-rag-contract.test.mjs` also checks its absence.

Remove that old case and its one-item `composeFiles` wrapper. Move its still-current SurrealDB/Open Notebook network membership and no-public-port assertions into the existing Open Notebook R2 deployment case, leaving health assertions intact. The old claim that a separate Agent OS cannot access knowledge is deliberately retired: the current native runtime lives in the product Worker, which legitimately uses the knowledge network. This is a consolidation of existing assertions, not replacing security checks with a skip. Total: five files deleted, one file reduced from three to two cases, nine test cases removed.

## Recorded results

- Original five regex files: 8 cases, **7 pass / 1 fail / 0 skip**, 2.027 seconds local command wall time. The failed historical M9 assertion expects removed `INTERVENTION`; current schema permits LEARNING/HOMEWORK/TEACHER_TAKEOVER/TEACHER_OPERATIONS. Original failure preserved.
- Retained identity/document/session group: **10 pass / 0 fail / 0 skip**; see `unit-pruning-retained.json` for measured wall time. Mocked local behavior only; no live provider/database or production actions.

Final modified-file checks: consolidated knowledge deployment **2/2 pass**, no skips (387.652 ms TAP duration); edited-file Biome lint and `git diff --check` passed. The selected 10-case retained behavior command took **1.839 s** wall time. Final code delta: **5 files deleted + 1 modified**, **147 lines deleted / 7 added**, **9 test cases removed**, **0 added**. These numbers are not a claim of end-to-end CI speedup. Exact patch is `unit-pruning.patch`; hash is recorded in the JSON manifest.
