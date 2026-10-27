# Issue #533: visible public tool-round observations

Base: `d544775f2809cb0f80502547ef383b6a40dcca02`. Root and server dependencies were restored from their unchanged locks to formal SDK 3.8.14; both were stale 3.5.2 initially. Old interrupted-task changes were not available and were not migrated.

## Owning path and change

The product Worker selects DeepSeek's native-v1 output contract in `server/src/agent-runtime/runtime.ts:65`; `parallelTools:false` prevents batches. Upstream native-v1 permits public output or one business call. The upstream candidate `LingXi-Org/LingxiOS` commit `640c2e4311293e81cc9c217e0359a53beab3d563` adds explicit native-v2 support without modifying installed packages.

Existing runtime publication persists public operation/delta/end/seal events. `public-events.ts` allowlists their purpose, part/attempt/request/fence and source fields for transport. `RunStreamProjection` and message projection preserve those identities. The product defaults typed commentary to process, and `NativeMessageContent` puts process in collapsed RunActivity.

The latest current, nonempty public text in process is now rendered outside that disclosure during running, waiting and interruption. It is excluded from the disclosure's live entries so it appears once. Original IDs, body ownership, pending controls, failure labels and archived process stay with their existing owners. Completed runs return commentary to history. Reasoning, answer revisions, stale request versions and tool names never manufacture the visible text.

## Actual verification

- `npm run typecheck` and `npm run server:typecheck`: passed after root and server formal dependencies were restored.
- Two focused presentation/rendering files: 35 tests passed. Includes real assistant-ui server rendering of current commentary during run/wait/cancel, body text once, replay/remount and existing failure/approval controls.
- Biome lint of the five changed TS/TSX files: passed.
- Two new persisted-event/SSE tests plus four existing public-event privacy tests: 6 passed. `server/src/__tests__/public-tool-rounds.test.ts` uses persisted events from an actual upstream Worker/PGlite run pass through formal SDK 3.8.14, product allowlisting and stream projection. It runs native SSE framing, the product encoder and the actual client decoder, and checks useful body before read start, observation/body and latest commentary before the write, final sources once, duplicate replay and reconstruction. The retained `worker-native-v2.json` is generated Worker evidence, not a hand-authored UI mock. This is deterministic source integration, not a browser or live-provider product run.

Upstream separately verified a controlled real DeepSeek scenario: native-v2 completed in two generations, useful body at 2058.94 ms, two synthetic read tools at 5054.88 ms, total 9401.76 ms; reported input/output totals 2455/569. Native-v1 failed protocol in its sole request, with no tool execution. Billing cost was not measured. See upstream evidence for boundaries.

## Pending integration

The product remains pinned to formally published SDK 3.8.14 and native-v1. Native-v2 cannot be enabled against that version. After the upstream contract is published, the sole integrator must:

1. Upgrade `package.json`, `package-lock.json`, `server/package.json`, `server/package-lock.json` to the exact formal SDK version and verify package integrity.
2. In the existing qualified DeepSeek selection in `runtimeModelConfiguration`, change the selected publicAnswerTool from `native-v1` to `native-v2`; set `parallelTools` to `nativeDeepSeekTools` (other provider profiles retain their existing opt-out).
3. Update the owning provider-configuration assertions and run them with the newly published package. Keep all current timeouts, budgets, authorization and the LLM ledger.
4. Hand rollout to the designated release owner; this task does not merge or deploy.

No source-built SDK substitution, dynamic compatibility adapter or installed-package patch was used in this product. No browser acceptance, production event/paint measurement, original screenshot diagnosis, package publication or production write was performed. #533 remains open until the formal dependency and product activation are integrated and the agreed acceptance boundary is recorded.

## CI follow-up

Initial product CI at c67a4204 failed server typechecking because this server replay test imported a client presentation module with browser-only path aliases and an ES2023 array API. The replay test now stays within formal server projection/metadata; existing UI rendering tests own current-commentary visibility. No compiler target or dependency scope was broadened.

Local server typecheck and both replay/SSE tests passed after the fix. Local root and server trees initially installed different locked Zod minors; verification uses the single root-locked dependency tree, matching CI's single-tree resolution, with formal SDK3.8.14. No tracked manifest/lock was changed by this CI fix.
