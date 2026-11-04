# #681 / #653: bounded native retrieval wait

Baseline: LingxiLoop `8cc00fd86441118ffacba5d3ca5b0f139944689a`, formal
LingxiOS3.8.24. #654 and #659 are already merged; their queue, model and public
output timing views are reused. No new observation framework or SDK patch is
introduced here.

The context prefetch passes a5,000ms search deadline, but native
`knowledge.search` called the same retrieval function without one. It inherited
the provider adapter's90,000ms default. Both search modes start concurrently;
`allSettled` preserves successful text results after a vector failure, but waits
for that vector to finish before returning them. Thus a stalled embedding/search
can retain an execution slot long after text has matched. This is a reproduced
code path, not attribution of every second in the historical112.45s T15 sample.

The retrieval function now defaults to the existing5s context search policy.
Explicit caller deadlines remain supported, including shorter limits. This is a
per-search transport budget, not a5s deadline for authorization, context assembly,
an entire tool round, a model call or a complete reply. Healthy vector results
still participate in fusion; a timed-out mode is explicitly `search_timeout` and
the result stays degraded/unavailable rather than pretending to be exhaustive.
The classification is a closed adapter field, not guessed from provider prose.

The existing provider signal cancels both connection/header waits and body reads.
All mode promises still settle; caller cancellation takes precedence, and the
post-search authorization/source-selection checks remain mandatory before
returning any retained citation. This does not prove an upstream service stops
its compute immediately after client cancellation. No retry, new model request,
concurrency change, #633 budget reduction or embedding-route change is added.

The new focused regression first failed on the baseline: both implicit search
timeouts were undefined. It now passes. The owning test uses the real retrieval
function/provider adapter, mocked database authorization and an entirely synthetic
transport. It covers healthy hybrid deduplication, shorter deadlines, slow headers,
slow bodies, vector-only success, total search failure, caller cancellation,
post-search revocation and filtering of foreign sources. A provider message which
merely mentions timeout cannot manufacture the new failure code.

Twenty alternating baseline/candidate pairs reproduce the old default via an
explicit90s caller value and compare it with the new omitted-value default. Only
the AbortSignal deadline clock is scaled1:100; configured values remain90,000 and
5,000ms. Both versions have identical inputs, adapter code, text hits and stalled
transport behavior. Baseline retrieval wall P50/P95 was901.21/904.87ms; candidate
was50.71/51.80ms. All40 partial results retained exactly one authorized citation,
with20 header aborts and20 body aborts, and no active synthetic transport after
return. The benchmark's80 transport requests made **zero real provider calls**.
Additional owning cancellation/failure tests are outside that benchmark count.
Machine-readable summary: [controlled-retrieval.json](controlled-retrieval.json).

These are scaled retrieval measurements, not real supplier latency, queue
capacity, first effective visible text, complete reply P50/P95 or a20-run T15
reproduction. Source/attachment parsing, historical T15 input and the real
run-level timeline remain separately qualified. #678 owns DOCX/attachment and
ingestion-state fixes; coordination is recorded in
[#678](https://github.com/LingXi-Org/LingxiLoop/issues/678#issuecomment-6632670964)
and [#681](https://github.com/LingXi-Org/LingxiLoop/issues/681#issuecomment-6632606862).
Shared-file edits here touch only the search deadline and failure classification,
leaving ingestion/source-version behavior intact.

Reproduce the focused regression with Node22 and installed server-ci dependencies:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  server/src/__tests__/knowledge-retrieval-deadline.test.ts \
  server/src/__tests__/knowledge-retrieval.test.ts
npm run server:typecheck
npm run server:lint
```

Run with the repository's ordinary synthetic unit-test environment. Final
local checks passed: both focused files, server184/184, knowledge vertical-slice
PostgreSQL20/20, server typecheck and lint. The disposable test database used the
ordinary actual-formal21→24 bootstrap followed by product62 migration; no target
startup checks were bypassed. Final candidate review and CI are recorded in the PR. Release belongs to
the designated sole integrator; no merge or production write is performed by
this contributor. #653 capacity acceptance and #681 real-task acceptance stay open.
