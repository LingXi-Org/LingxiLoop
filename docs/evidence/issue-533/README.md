# Issue #533: public tool rounds

Base: `d544775f2809cb0f80502547ef383b6a40dcca02`. Old interrupted-task changes were unavailable and were not migrated. No archived agent was resumed.

## Final behavior

The latest current, nonempty public commentary is visible outside collapsed RunActivity while running, waiting or interrupted, and is removed from the disclosure's live entries so it appears once. Original IDs, body ownership, pending controls, failure labels and archived process remain in their existing owners. Completed runs return commentary to history. No reasoning, answer revision, stale request or tool name is promoted into a generated summary.

The product now pins formally published SDK **3.8.15** in root/server manifests and exact locks. Existing scoped dependency profiles were regenerated from the root lock. Registry version, tarball and integrity match both locks; unrelated npm dev-flag normalization was discarded. Only the qualified SiliconFlow DeepSeek-V4.1-Flash selection enables `publicAnswerTool:native-v2` and `parallelTools:true`; other provider selections retain their existing opt-out. Timeouts, correction budgets, authorization and the shared LLM ledger remain unchanged.

Upstream native-v2 lets one generation stream useful public text and original-schema business calls. The whole batch is validated and public content durably sealed before dispatch. Existing read scheduling can overlap independent calls; writes, approval, idempotency, fencing and cancellation stay in their owning paths. Tool failure observations do not force a rewrite of already useful answer text. No summary model, new review model or fixed extra loop was added.

## Formal SDK provenance

- Upstream PR: https://github.com/LingXi-Org/LingxiOS/pull/71 (merged).
- Main/tag/registry gitHead: `bb86af911faafed3bb29a18192ceb113d79d6724`, tag `v3.8.15`.
- Exact main release gate: https://github.com/LingXi-Org/LingxiOS/actions/runs/40438770019 (success; 1223 tests passed, zero failed, formal qualification artifact).
- Formal publication: https://github.com/LingXi-Org/LingxiOS/actions/runs/40440153370 (success).
- `published-sdk.json` retains the registry version, immutable tarball, integrity and gitHead. No source-built SDK substitution or installed-package patch was used.

## Actual verification

- Formal 3.8.15: `public-text-deployment.test.ts`, `public-tool-rounds.test.ts`, `public-events.test.ts`: **9 passed**, zero failed. The real public Worker factory accepts the actual v2 configuration without starting a worker, provider request or production operation. Other provider profiles retain `parallelTools:false`.
- `npm run typecheck` and `npm run server:typecheck`: passed with formal 3.8.15.
- Focused runtime/configuration lint and scoped dependency profile consistency: passed.
- UI change: **35** presentation/real assistant-ui rendering tests passed, including current commentary during run/wait/cancel, body once, remount and existing failure/approval controls.
- A persisted real upstream Worker/PGlite capture passes through the formal SDK reader, product allowlist, native SSE framing, product encoder and actual client decoder. Tests establish useful body before read start, stage content before the write, final sources once, duplicate replay and reconstruction. `worker-native-v2.json` is generated Worker evidence, not a hand-authored UI mock.
- Upstream focused checks: **31 driver / 28 Worker-PGlite tests** passed. Synthetic comparison: the same two read observations, one write and final sources use six generations/max one read with native-v1 versus three/max two reads with native-v2, with zero auxiliary calls.
- A separate controlled real DeepSeek sample completed explanation, two local synthetic reads and an observation-based conclusion in two generations: first body 2058.94ms, tools 5054.88ms, total 9401.76ms, input/output tokens 2455/569. Native-v1 failed protocol in its sole control request; that failed baseline does not prove a general speedup. No provider billing receipt was measured.

## CI correction and boundary

Initial c67a4204 CI failed server typechecking because the replay test imported client presentation with browser path aliases and an ES2023 array API. The test was narrowed to server projection/metadata, leaving rendering assertions with the UI owner. Product commit 275345627e29de96ce17b96a2a137e02b0a67329 then passed scoped CI: https://github.com/LingXi-Org/LingxiLoop/actions/runs/40437890368. The final dependency/configuration commit has its own PR CI.

Root/server initially held stale SDK3.5.2. Local verification now uses the formal root-locked dependency tree, matching CI's single-tree resolution; server's exact SDK lock matches the same published artifact. No compiler target or CI dependency scope was broadened.

Production has not been changed by this task. No product PR merge or deployment, browser acceptance, production paint/event measurement or diagnosis of the original screenshot's exact run was performed. The live provider sample did not execute through product Worker/UI or generate an interactive component. #533 stays open for the designated sole production integrator to finish the agreed release/verification boundary.
