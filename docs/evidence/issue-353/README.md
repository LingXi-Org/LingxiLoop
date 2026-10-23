# #353 compact reading activity

Knowledge calls rendered the existing ToolCall row plus a second ProgressTracker status card. The duplicate is removed. The shared compact row keeps only the closed public source-state vocabulary, while public details, reply text, reference actions and approval controls remain intact. Unknown/cancelled/failed receipts take precedence over an older `ready` source result.

A successful tool receipt can still report `sourceStatus=unavailable`. This state now uses the ordinary unresolved attention region and error feedback; a recovered satisfied run retains it in history. Unrelated tools and cancelled knowledge calls do not gain a new failure classification. No execution, authorization, ledger, runtime, schema or deployment changes.

Validation:

- Failure model and failing regressions preceded each product change: duplicate card (`1 != 0`), and unavailable source classified as process instead of attention.
- Existing message/progress checks: 23 passed. Explicit new reading-state regression: 1 passed. Owning presentation checks after the attention delta: 7 passed.
- Web typecheck and focused lint passed before the final attention delta; the delta's focused lint passed. Final exact-head CI remains the release gate.
- Official `e2e` / `@e2e-dev/web`: light 1440 and dark 390 compact-row/details/reference/reload checks passed; the separate final state sweep passed all no-match, empty, processing, unavailable, failed, cancelled, unknown and approval assertions. This is two passing tests plus one passing targeted continuation, not an invented single all-green run.
- The initial browser preview's esbuild service died during shared memory pressure. Subsequent fixture-only corrections matched the existing safe external-link button and the error icon's accessible name. Failure artifacts remain in the scoped `.e2e/issue353` workspace; they are not relabeled as successes.

All data and screenshots here are synthetic. No production conversation, provider, permission change or user data was accessed. The product's real Markdown external-link confirmation was exercised through its visible button and exact target URL; no navigation to that external site was performed.

Reproduce the isolated browser fixture on a free loopback port using `e2e/vite.react-activity.config.ts`, then:

```sh
E2E_BASE_URL=http://127.0.0.1:5353 E2E_PROJECT=web \
E2E_READING_ACTIVITY_FIXTURE=1 E2E_TELEMETRY_DISABLED=1 \
node node_modules/e2e/dist/cli/bin.js run e2e/web/reading-activity.e2e.ts \
  --workers 1 --retries 0 --output .e2e/issue353/browser
```

Root remains the sole integration and production owner. Issue #353 stays open until deployed and recorded.
