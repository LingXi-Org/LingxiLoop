# Agent work waterfall failure model

Written before implementation. Fixtures are synthetic; no production or paid provider requests.

- A native snapshot contains model spans but omits a tool whose authorized public events are already present. Selecting the native trace must not erase that actual work.
- Native and public representations of the same durable tool call must appear once. Parallel calls and retries with distinct identities must remain distinct even with identical names or text.
- A public event ahead of the native snapshot, or from a different request/fence, must not be attached to that snapshot. Supplemental spans belong only to the already-authorized root run.
- Skills, retrieval, ordinary tools and authorized child runs must be visible in the same real hierarchy, filterable and keyboard-collapsible. Filters must retain actual ancestors without inventing timed group spans.
- Missing historical epochs remain null. Captured start/end epochs remain exact; duration never supplies a missing epoch. New public tool events already have native CP execution timing and product instrumentation epochs.
- Tool names and descriptions come from fixed public action labels; only existing authorized display summaries enter details. Raw arguments/results, hidden reasoning and credentials never enter the trace.
- Non-model rows never create token/cost records. Existing model ledger identity, partial subtotals and unknown fees remain unchanged after adding or filtering work.
- Stream refresh, committed history and replay must produce the same final work identities, endpoints and statuses. Cancellation/failure cannot invent a completed interval.

Known upstream collection gaps: pure Python emits internal `ipython.started/completed/failed/timeout`, but these are excluded from the formal RunTraceSnapshot and lack `_executionTrace` timing. Runtime-owned `task.inspect`/resource-refresh actions do not emit the tool lifecycle hook used by direct model tools. Internal substeps and retry links have no public stage contract. These require a separate formal upstream collection change; this product change must not infer their timestamps or claim full coverage.
