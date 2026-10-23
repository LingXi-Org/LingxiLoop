# #366 acceptance plan

No real provider execution is authorized by this file. Root remains the sole
integration and production publisher. The failure inventory is
[RECOVERY-FAILURE-MODEL.md](RECOVERY-FAILURE-MODEL.md).

## Synthetic fixtures

The product fixture passes synthetic native events through the actual
`RunStreamProjection` and `assistantRunResponse` implementations, exporting
product snapshots with producer `native-event-projection-fixture`. It does not
execute a ModelDriver, provider, tool or durable result transaction. Checkpoints:
`answer-a`, `first-tool-held`, `commentary`, `second-tool-held`, `answer-b`, and
`final`. A and B are short distinct factual explanations from supplied synthetic
facts. Commentary and private-data canaries have unique strings. The projected
tool states let the browser observe A before B; actual runtime/tool gating is
tested separately by the OS scripted-provider suite.

The browser consumer does not invent a new protocol or a successful receipt. It
uses the actual output produced by the product projection fixture, replayed through the
normal HTTP transport/decoder/store, and checks ordinary answer visibility after
each checkpoint. It also opens independently loaded fixture history and compares that
rendering to the last live frame. No expectation is derived from the product's
actual output; the scenario's authored expected text and identities are separate.

Required replay cases:

- Append A, hold tool, commentary, hold another tool, append B, finalize without
  repeating either segment; A never disappears or moves to collapsed process.
- Failed replacement and cancellation preserve A; successful same-request
  replacement becomes visible atomically with no old/new hybrid frame.
- Duplicate/overlapping pages, stale snapshot after new snapshot, reconnect and
  final history converge. Equal text belonging to a different run stays separate.
- Real failed/unknown/cancelled activity stays visible with the correct status;
  process text and private canaries never become substantive answer text.

The runtime owner supplies scripted-provider execution and public durable tests for null finalization, seal
integrity, old-fence recovery/new-write rejection, cancellation before dispatch,
unknown-effect reconciliation and final assembled-body validation. These do not
become browser-only assertions. Projection replay cannot stand in for runtime
execution, authorization or tool side-effect validation.

## Performance and real-provider qualification

First report synthetic call counts and gate ordering; do not convert fixture
delays to a production latency improvement. Keep independent clocks separate:
request admission, worker claim, provider call, public event, SSE receive, DOM
observation and final delivery. Observe useful content, not a spinner or status.

After explicit approval for the frozen candidate, run one ordinary arithmetic
case and one synthetic explanation-plus-interactive-view case using the existing
provider configuration. Record the result of each attempt even on failure.
The view must have an authorized delivered reference and actual browser
interaction. Independent review confirms the explanation's meaning and that it
was available before saving. Absence of a semantic judge is checked in the real
usage ledger, not inferred from the answer. Existing failed attempts remain part
of the release evidence; do not silently rerun until green.

## Release handoff

The handoff contains exact OS/product commits, exact passing CI, the formal
runtime artifact, completed gates and any deliberately unexecuted gates. It must
state whether ordinary-answer, visual-delivery, recovery and production checks
each passed, failed or remain unmeasured. No task is declared complete solely
because the answer stream contains useful text.

## Upstream reuse and test responsibility

The runtime uses the actual public `messagesStateReducer` from
`@langchain/langgraph@1.5.2/web` and `AIMessageChunk.concat` from
`@langchain/core@1.3.0`. Its source/commit/license/function map is maintained in
LingxiOS `docs/react-harness-reuse.md`; the OS owner retains upstream
append/update/remove/order and chunk/tool-delta regressions. The product browser
fixture consumes these native-event projections and does not implement another
identity reducer. Its independent cases cover append retention, successful and
failed replacement, cancellation, stale/reconnected streams and equal text in
different runs. The OS recovery suite separately checks sealed provenance,
native-step forgery, cancellation, transactional rollback and bounded pagination.

Local commands after the owning integration creates its artifact:

```sh
E2E_REACT_DELIVERY_ARTIFACT=artifacts/react-delivery-366/snapshots.json \
  E2E_TELEMETRY_DISABLED=1 node node_modules/e2e/dist/cli/bin.js run --config e2e.react-delivery.config.ts
```

The fixture does not skip missing scenarios or missing evidence. Its report labels replay-to-DOM
observation timing as a synthetic browser measurement, not production TTFT.
