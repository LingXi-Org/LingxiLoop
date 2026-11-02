# #627 tool batches and failed-call placement

The product remains on the exact published `@lyyzka/lingxios@3.8.21` in both locks.
No SDK internals, deployment settings, credentials or tool effect declarations
were changed. The initial preinstalled SDK was3.8.16, so the isolated worktree was
installed from the current lock before qualifying behavior.

The formal public `ToolDefinition.effect` contract allows concurrent `read`
tools. The shipped Worker schedules an all-read native batch in groups of at
most four; a batch containing a transaction, uncertain action, Python or a
waiting tool stays sequential. The current DeepSeek/SiliconFlow product model
configuration already declares parallel native tools. Product guidance now asks
for independent reads together, after their inputs are known, and requires
observations before dependent calls. It preserves the existing instruction to
load a skill before any tool that depends on its guidance.

Tool failures previously moved to `attention` in both the product projection
and the browser. They now update their original process entry. Pending approvals,
input and unknown effects retain their current attention/reconciliation owner;
run-level terminal feedback and recovery controls are unchanged. Historical IM
parts annotated as attention also remain in process when their receipt is a
known failure. Unclassified legacy failures keep their visible fallback.

The native Worker reserves `partIndex` before dispatch. Concurrent admission can
commit `tool.started` in a different order, which was observed during fixture
development. The projection now orders calls within the exact existing
request/fence/model-attempt identity by that native index, occupying that
attempt's recorded start slots. It retains native event sequence and execution
clocks for traces. Legacy calls retain event ordering. No separate batch state
machine or invented execution time was added.

## Executed validation

Local environment: Linux, Node24.19.0; isolated local PostgreSQL16/Redis;
Chromium154.0.8037.57. CI uses the repository's Node22 setup. The dedicated test
database was bootstrapped with the repository's verified formal20/product61 to
formal21 CAS procedure. No production request or fault injection was made.

- Before changes, the focused regressions reproduced failed calls moving to
  attention and reversed start events overriding model-call order.
- Focused projection/presentation regressions:22 passed. Server smoke:162 passed.
- Web smoke initially had149 passes and one obsolete expectation that a tool
  failure is appended outside collapsed process. That expectation was updated;
  all27 ConversationMessage tests passed on the corrected source. Final full web
  result is supplied by CI, not inferred from that targeted rerun.
- Web and server typechecks, changed-file Biome lint, and production web build
  passed. The build retains existing chunk-size/dynamic-import warnings.
- `runtime-tool-batches.test.ts`:3 passed using the published Worker, real
  product authorization, PostgreSQL, a local synthetic provider emitting the
  production `native-v3` wire contract, product delivery through a recording IM
  HTTP server, and the real scoped activity-history HTTP endpoint.
- Parallel partial-failure execution: the two first execute intervals were
  [5626.630,5627.987] and [5626.768,5761.549]ms on the same monotonic clock.
  A barrier requires both execute callbacks to enter before the first can fail.
  The peer continues, a later model generation receives both outcomes, a new
  retry succeeds, and the original failed call remains in its original slot.
- A mixed `files.list → chat.history(transaction) → files.list` batch records
  each completion before the next start. This exercises the actual product
  transaction tool, including its existing read-receipt side effect.
- Cancellation reaches the active read's AbortSignal, retains the peer's
  success, starts no further model generation, and projects cancellation in the
  same call entry. Ingress replay executes no second set of calls.
- Browser replay uses the actual NativeMessageContent/RunActivity/NativeTool
  components with those real local Worker snapshots. It checks failure beside
  a running peer, later retry/answer, same call identities after refresh,
  cancellation, and no overflow at390px. Screenshots were visually inspected.

Evidence: [partial running](evidence/partial-running.png),
[completed retry](evidence/completed-retry.png),
[mobile](evidence/completed-mobile.png),
[cancelled mobile](evidence/cancelled-mobile.png),
[browser assertions](evidence/browser.json), and the three scenario JSON records.

## Reproduction

Use the repository's documented local test service setup and bootstrap command,
with `INTEGRATION_DATABASE_URL`/`DATABASE_URL` naming a dedicated local `_test`
database and an explicit test Redis. Then run:

```sh
node server/run-integration-tests.mjs --file runtime-tool-batches.test.ts
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node perf/issue-627/browser.mjs
```

The browser script requires Chromium (`CHROME_PATH` can override its path). Its
fixture is served only by the local Vite dev server and is excluded from the
production entry graph. The JSON records are synthetic local fixture data.

## Remaining acceptance boundaries

This verifies the installed SDK and product transport with a synthetic provider;
it is not a live SiliconFlow/provider qualification or a real production-account
browser session. Other provider configurations retain their existing conservative
capability declarations. All-write or mixed batches intentionally stay serialized.
The browser refresh check replays persisted snapshots; a real network disconnect
and reconnect, approval submission/resumption, uncertain external write recovery,
and worker-process crash recovery were not newly exercised here. Existing checks
retain those owners; this change does not add per-tool retry controls. Retrying in
the fixture is a later native model call with its own real receipt, preserving the
original failure.

The designated sole integrator must review the final PR and perform the merged
production deployment and readiness checks. This task does not merge or deploy.
