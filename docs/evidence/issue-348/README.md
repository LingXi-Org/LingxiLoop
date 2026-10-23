# #348 agent work in the waterfall — product phase

This phase preserves actual tool work when a partial native trace contains only model spans. It also exposes fixed skill/retrieval/tool/subtask filters while retaining real parent-child rows and keyboard folding. It uses the existing formal LingxiOS 3.8.3 public API; no runtime version, dependency lock, database schema or model request changes.

## Event audit

| Work | Existing authoritative source | Identity / time / status | Product behavior |
| --- | --- | --- | --- |
| Native host tools, skill load/activation, search/read | `tool.started` / `tool.completed`, public `RunTraceSnapshot` | Run + durable tool call + request + fence; CP `_executionTrace.at`; native state | Preserve each call, fixed action labels, skill/retrieval classification |
| Tool missing from an otherwise available native snapshot | Already-authorized public tool events | Same current request/fence, event sequence no later than snapshot; captured CP clocks | Add only the unmatched actual root-run call; native identity wins when present |
| Authorized graph child | Public `readRunTrace` descendant and explicit `parentSpanId` / `childRunId` | Native span ID and actual execution epochs; queued epochs remain null | Preserve native hierarchy and child filter/folding |
| Model work | Existing public model trace and scoped usage ledger | Exact call identity; measured recorded usage / fees | Existing accounting unchanged; non-model work never adds a fee |

The UI had no model-only filter. The concrete coverage loss was in `buildNativeRunTrace`: selecting any native trace discarded public tools absent from that native snapshot. A second loss was the public-event projection stripping the CP timing tuple, leaving native skills without fallback epochs because they do not use the product tool-display wrapper. Only `version/at/requestVersion/fence` survives from that tuple; all other internal fields are excluded. Optional product display reads cannot overwrite captured CP epochs.

Tool summaries and public input fields still use the existing authorized display whitelist. Raw arguments, raw results, script source, hidden reasoning, prompts and credentials do not enter the waterfall. Stage selection uses exact registered action names rather than text or repeated wording. No subscriber time, event sequence or duration supplies a missing start/end.

## Verification

- Failure inventory and initial failing coverage tests were written before implementation. Three initial tests reproduced dropped tools and absent stage metadata; the later timing regression reproduced lost CP epochs before its fix.
- Focused projection, trace, terminal, presentation coverage, answer handoff and UI checks: **55/55 passed**.
- Real isolated PostgreSQL + formal Worker/control integration: **1/1 passed**. It executes actual skill loading and retrieval, checks their real captured intervals, injects a model-only native collector and verifies public event intervals exactly match the original native intervals, then compares history/SSE/reload. It also creates an authorized real graph child; no execution epochs are invented for the queued child. Another-tenant reading returns no trace.
- Official `e2e` / `@e2e-dev/web` browser verification: **2/2 passed**, covering synthetic full child execution and real local Worker snapshots through the normal AssistantTransport/store/renderer. The final report and screenshots are under `browser/`.
- Web/server typechecks, E2E typecheck, focused lint and production build passed. Build output was placed under `/tmp/issue348-build`. Existing CSS/chunk warnings remain.

The first local SQL attempt failed because the workspace disk was full; only this task's temporary resources were cleaned. The successful integration uses a dedicated loopback PostgreSQL container with an in-memory data directory. Earlier browser attempts exposed fixture setup issues (the nested details disclosure and an empty queued-parent message), which were corrected before final verification; no failed run is represented as passed.

## Remaining collection work

This product phase does **not** close #348. The separate upstream phase collects existing Python lifecycle events and runtime-owned host actions such as `task.inspect` / resource refresh through a formal public trace. Those events previously lacked the required public timing/identity collection. That work does not modify the frozen 3.8.4 release and requires its own upstream review, CI and formal release before product integration. No historical missing timestamp can be reconstructed by this patch.

## Reproduce

Use the pinned root dependencies. Generate synthetic projection snapshots with `ISSUE348_SNAPSHOTS=.e2e/issue348-snapshots.json` while running `server/src/__tests__/agent-work-trace.test.ts`. Run `server/src/__integration__/agent-work-trace.test.ts` against an explicitly migrated, dedicated local test database with `ISSUE348_REAL_SNAPSHOTS=.e2e/issue348-real-snapshots.json`. All model/tool data are synthetic; no provider credentials are needed.

Start Vite with `e2e/vite.react-activity.config.ts` on a free loopback port, then run the official engine:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/review304-browsers \
E2E_BASE_URL=http://127.0.0.1:5348 E2E_PROJECT=web E2E_TELEMETRY_DISABLED=1 \
node node_modules/e2e/dist/cli/bin.js run e2e/web/agent-work-trace.e2e.ts \
  --workers 1 --retries 0 --output .e2e/issue348-browser-verified
```

Exact-head CI and independent review remain integration gates. Root is the sole merge and production integrator; this work performed no paid provider call, production access, merge or deployment.
