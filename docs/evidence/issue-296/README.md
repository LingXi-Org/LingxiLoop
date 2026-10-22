# Issue 296: trace data and exact execution endpoints

This evidence uses synthetic local records and the user's redacted three-call example. It contains no production conversations, original visualization HTML, credentials or raw model input. Production access was not retried, and no production change or acceptance is claimed.

`ended.png` records an execution that has ended with a genuine `partial` lifecycle and `inconclusive` goal outcome; it does not establish a satisfied goal. The formal 3.8.0 trace reader maps this state to `unknown`, so the screenshot's trace label is `结果未知` while the message is `未完成`. The separate issue 298 upgrade and its product status patch preserve `partial`/`blocked` after the formal 3.8.1 package is available. These captures establish real recorded intervals, not a successful outcome for this fixture.

## Findings and correction

- The product SSE bootstrap explicitly omitted the native trace, while optional enrichment only refreshed usage-ledger fallback. Bootstrap now reads the published `readRunTrace`; asynchronous enrichment refreshes it independently of answer frames. Native stream trace frames, including authorized child updates, remain enabled.
- Usage fallback had durations but no invocation epochs and its root used creation time as execution start. New product invocations capture real wall-clock start/end before and after the HTTP operation; native observation settlement is recorded only as an end, never used to invent a start. Creation remains only a fallback offset anchor; root execution start/end/duration stay absent without an actual native interval.
- Native spans and matching ledger entries merge by durable call ID, not model names, order or subscriber arrival. Public output never emits the raw ledger call IDs. The native run, model and tool intervals retain their exact source offsets and execution origin; details include an ISO-backed local timestamp with milliseconds and the corresponding offset. Running end stays absent even though the bar has a live progress edge.
- Standard embedding responses have `prompt_tokens` and `total_tokens`, without completion tokens. The product path now records measured input with explicit zero generated tokens, so the new Pro price snapshot is retained. Each request captures its own tariff timestamp. Native 3.8 observations expose settlement time but no issue epoch, so their time-dependent pricing retains the explicitly tagged conservative standard-peak estimate, rather than using callback time or subtracting latency.
- The SQL projection recognizes persisted supplier pricing snapshots in addition to native price schedules. It never recalculates historical calls at a new tariff. Exact registered BAAI, Pro BAAI and Qwen embedding identities remain distinct from chat calls. A child embedding with no matching, scoped supplier-price ledger record does **not** inherit the native general chat-budget price; its charge remains unavailable and known charges remain a partial subtotal. No child-ledger or principal/internal authorization boundary was widened.
- Without any anchored interval, the UI keeps measured durations and partial fees but draws no invented 0–2ms axis or positioned bars. With intervals, the ordinary waterfall remains. Known partial fees are labelled `已计` rather than presented as a complete total; missing costs never become zero.
- Shared historical DTO reading removes only known system-generated obsolete tool summaries, recursively, and corrects exact registered embedding labels. Historical model IDs, token counts, recorded charges and storage remain unchanged; arbitrary useful tool output is preserved. This complements #295's source/UI diagnostic-copy removal.

## Verification

- Focused regressions were written before implementation. The initial run reproduced six data-path failures; follow-up review regressions reproduced the old DTO copy and creation-anchor issues before their corrections.
- The final focused set passes 37/37 with no skips, including nested child embedding budget-price rejection, partial sums, stale reads, streamed text preservation, actual per-attempt time capture, and historical DTO projections.
- The real local PostgreSQL/Worker/control/SSE test now pauses the first model invocation. It verifies true run/model starts with absent live end/duration, then confirms the identical start survives termination and the recorded end is filled. Terminal bootstrap, SSE replay and reload have identical native endpoints; revoked/other-tenant reads remain denied.
- A real loopback HTTP embedding response crosses capture, PostgreSQL ledger persistence and scoped trace reading. Ten Pro input tokens at CNY 0.000070/K with the fixture's explicit CNY 7/USD rate produce USD 0.0000001. Historical ordinary BAAI remains unchanged and unpriced when its original record lacks a price.
- The two owning integration cases pass, with no skips. A first teardown failed because `DROP DATABASE ... FORCE` raced closed client sockets; the fixture now waits for its own sessions to leave and drops normally. The final run is 2/2 passed; the earlier failure is not represented as a pass.
- Official `e2e` 0.17.0 / `@e2e-dev/web` 0.12.0 selected browser flows pass 2/2: running/first load/replay/reload endpoint and timestamp equality; duration-only historical embedding with partial fees and no fabricated axis. All other browser flows were filtered, not run. Native selected results and report digest are in `browser-results.json`; exact tested source hashes are in `source-sha256.json`.
- Local server lint, server typecheck and Web typecheck pass using the same root dependency layout as CI and the formally published 3.8.0 package. The earlier standalone-server install introduced incompatible duplicate Zod/Node types; restoring the CI dependency layout removed those environment errors without unrelated source edits.
- After issues 295 and 297 merged, this branch was rebased onto main `671d72fb`. Their duplicate dependency commits were removed. All eight recorded trace source hashes remain identical to the independently reviewed candidate, and the integration retains main's existing fixture-session drain before ordinary database removal.

## Reproduce

Use the repository Node 22 runtime and root `npm ci` dependencies. Start only the loopback PostgreSQL fixture from `e2e/server/compose.yaml`, then set the dedicated fixture `INTEGRATION_DATABASE_URL` and synthetic server environment used by the test runner.

```sh
ISSUE296_SNAPSHOTS=/tmp/trace296-native-snapshots.json \
  npm run test:integration -- --file native-run-trace.test.ts --file trace-ledger-timing.test.ts
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  server/src/__tests__/{run-trace,native-run-trace,trace-activity,trace-presentation-coverage,llm-timing}.test.ts \
  src/lib/runTrace.test.ts src/components/trace-waterfall/trace-waterfall.test.tsx
vite --config e2e/vite.react-activity.config.ts --host 127.0.0.1 --port 5196
E2E_BASE_URL=http://127.0.0.1:5196 E2E_PROJECT=web E2E_TELEMETRY_DISABLED=1 \
  ISSUE296_SNAPSHOTS=/tmp/trace296-native-snapshots.json \
  e2e run e2e/web/trace-data.e2e.ts --workers 1 --retries 0
```

Historical never-recorded start/end epochs cannot be recovered by this change. This evidence establishes local correctness, not live production health, actual supplier latency or complete historical reconstruction. The unique integrator owns final commit CI, any formal runtime update and production release after lawful access is restored.
