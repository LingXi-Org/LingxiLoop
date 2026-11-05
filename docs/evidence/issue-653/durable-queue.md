# Persistent queue qualification

This continues #653/#681 on main `bb1186f4` and the locked formal LingxiOS3.8.25.
#654/#659 already provide queue/attempt/model/publication views. #686 already
bounded the native search default at5s. This change qualifies that correction at
the persistent queue boundary; it does not increase production capacity or add a
second observation stack.

The fixture uses a dedicated local PostgreSQL/Redis test environment, the normal
formal24→25/product62 bootstrap, public `createLingxiOS` and two public Worker
instances in one process. Each Worker retains task2/model2/reserved-interactive1.
Jobs enter through public `enqueueJob`, use separate durable sessions/roots and
the ordinary conversation pipeline, and commit checked native-v3 answers. The
production `runtimeModelConfiguration` is reused with its provider URL replaced
by a loopback HTTP server. An outbound guard refuses non-loopback fetches. No
Python, real model/embedding request, production credentials or production write
is involved.

For each of interactive, background and mixed load,20 roots are submitted before
Workers start. Mixed load has10 interactive and10 operation-class background
roots. Baseline and candidate have the same source, actor, arrival pattern,
Worker configuration, model response and provider latency:80ms for model HTTP,
10ms for text search and6,100ms for vector search. Baseline explicitly passes the
old90s search default; candidate omits it and uses the merged5s default. All
clocks run at1:1. This is a finite burst, not a steady arrival-rate or open-ended
background-starvation qualification.

Retrieval runs through the real product function/provider adapter and current
permissions against product tables. The controlled context loader invokes the
shared retrieval function after claim; it does not replay the entire product
context assembler or native knowledge-tool catalog. The baseline explicitly
models the native tool's former90s default, not the already-bounded historical
context prefetch. Foreign-source hits are rejected. The
candidate retains the text citation and a closed vector `search_timeout` failure;
healthy baseline hybrid results deduplicate to the same citation. The fixture
context preserves the runtime's frozen-evidence contract, so retries/refreshes
cannot silently add repeated retrievals. Public text repeats the real permission
check within the runtime's bounded transaction. Every ordinary root must have
one native claim, one model call, one committed answer with the authorized source,
and a satisfied native outcome. The model/embedding answers themselves are
scripted; this does not test teaching quality or a real model's failure disclosure.

After each baseline and **before** running its candidate, the fixture freezes
numeric budgets: queue P95 and submission-to-terminal-observation P95 at95% of
that baseline, execution P95≤6,000ms, success rate1 and one provider call per root.
The emitted budget record precedes the result record. These are gates for the
specified burst only, not production SLAs. Matching token/cost snapshots and
at-least-once replay of the shared product ledger callback guard against changing
the workload or double billing to obtain the improvement. Prices and usage are
synthetic; no real supplier cost claim follows.

Measurements remain separate:

- Queue is the SDK's eligible-to-`run.started` interval, including claim recovery.
  Claim-return timestamps provide an additional **upper observation** of
  eligible-to-claim, with RPC latency reported separately.
- Execution is the persisted attempt total. Retrieval wall time, settled SDK
  model stages and publication snapshots remain separate overlapping intervals.
  Provider-only computation is unavailable, never obtained by subtraction.
- First durable public-text ACK is recorded after the actual `public.text.delta`
  host operation returns. It is neither network TTFB nor browser visibility.
- Submission-to-terminal-observation starts before enqueue/binding and ends at
  the first50ms-poll observation of terminal state. It includes submission time
  and observation lag, and does not mean IM delivery or a browser's complete reply.
- `maxClaimedUncommitted` covers claim through durable result commit. Separately
  sampled public `Worker.activeRuns` includes runtime work after commit. Neither
  is renamed as exact global fleet occupancy. Queue depth/oldest are sampled
  public snapshots, and delayed future availability is excluded.

Unknown SDK stage measurements stay null. The existing product API still leaves
unavailable end-to-end and current active model-permit wait fields unknown. The
permit-contention case lowers only its test Worker's model slots to1 and checks
that settled permit waiting appears independently in the existing authorized
ledger reader. No production model limit changes.

Lifecycle coverage uses real durable state: future availability cannot be
claimed early; a cancelled queued root never executes; an abandoned lease is
eventually reclaimed with a larger fence. The test first confirms successful old
heartbeat and rejection of immediate competing claims, then waits without
changing SQL state or clocks. It records actual claim-to-reclaim time but leaves
the exact public lease TTL unknown. Old heartbeat and a syntactically valid stale
termination must be rejected. The replacement Worker then executes the same
publicly acquired lease through `runNext`, preserving normal recovery and result
validation. This is not a deployment, host crash/network partition simulation,
side-effect replay qualification or a supplier-quota measurement.

Prototype failures were not counted as passes: an in-memory-style custom
processor omitted required goal evidence; the initial native-v3 setup omitted
durable public-text authorization; a200-item query exceeded the public reader's
limit; and a held recovered lease could not be yielded without a preemption.
The final fixture uses the real conversation/authorization path, a100-item
bounded reader and the already claimed replacement lease, with no SDK patch or
weakened completion check. Optional stage fields are not fabricated as zero.
The first complete11-file selection exhausted the old360s batch budget during
the final real-lease wait; that batch failed and is not counted as qualification.
Its already-completed profile measurements remain preliminary. The exact
selection is rerun after adding the named owner allowance.

The three profiles and lifecycle checks are separate owning files; the ordinary
180s per-file limit is unchanged. Only the four explicitly named owners add a
selected-run allowance (90/150/120/90s respectively), preserving ordinary selected,
smoke, full and artifact budgets. CI's exact selection is seven smoke plus four
owners, not four files alone. The helper maps back to all four owners and has a
scope regression, so changing only the helper cannot silently omit qualification.
Reproduce on a
dedicated, normally bootstrapped test database:

```sh
node server/run-integration-tests.mjs \
  --file runtime-queue-interactive-capacity.test.ts \
  --file runtime-queue-background-capacity.test.ts \
  --file runtime-queue-capacity.test.ts \
  --file runtime-queue-lifecycle.test.ts
npm run server:typecheck
npm run server:lint
```

The final exact11-file selection passed22/22 tests in386.563s. The selector/budget
regressions passed20/20. Its seven smoke files and four owning files are retained
in [the result receipt](durable-queue-results.json);120 per-root observations are
in [the numeric samples](durable-queue-samples.jsonl), with a hash in the receipt.
The recorded run retains the actual5s deadline and real abandoned-lease wait.
P95 values below are seconds; each pair is baseline→candidate:

| Controlled profile | Queue | Attempt execution | First durable public-text ACK | Submission→terminal observation | Candidate queue gate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Interactive20 |26.729→21.885|6.875→5.516|33.057→27.115|33.252→27.296|25.393|
| Background20 |58.508→48.255|6.667→5.366|64.773→53.439|64.905→53.593|55.583|
| Mixed10+10 |39.387→32.413|6.812→5.486|45.716→37.594|45.859→37.757|37.418|

All120 ordinary roots committed a native satisfied result with one authorized
citation and one scripted generation each. The120 call observations were unique,
with0 corrections in this controlled load; the real model's correction load is
not qualified by that zero. Matched variants retained identical token/cost
snapshots. There were240 controlled search requests,60 vector cancellations and
no live-provider calls. The separate lease case observed reclamation after about
45s and completed the replacement attempt; the exact public TTL remains unknown.

The final selection also logged **nine native outbox acknowledgement warnings**:
five in the existing smoke files, four when the new lifecycle control stopped.
These are warning counts, not a count of lost calls. Shared-ledger settlement and callback replay assertions
passed, but these warnings are not relabelled as successful ACKs. Native durable
intent retention is reported by the SDK; a fully drained usage outbox across
shutdown, external IM delivery and production health are explicitly unqualified.
No product/SDK shutdown behavior is changed or warning suppressed here.

Final type/lint, independent review and CI are recorded with the candidate.
Raw T15 inputs are unavailable; no synthetic result here is
a production P95. #653/#681 remain open for controlled real-user-task/arrival-rate,
shared supplier RPM/TPM/concurrency and deployed-health acceptance. Production
release belongs to the existing sole publisher.
