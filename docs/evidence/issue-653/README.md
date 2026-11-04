# #653 queue and capacity baseline — incomplete acceptance

Base: `dd064748a6c9f8f96c1963d508471b0376639707` (2026-11-03). No assignee
or related PR existed at initial issue/comment/PR lookup. The single comment
was the task-email receipt. #646/#648/#649 are user-owned; no files from those
changes are edited here. LingxiOS #83/#84 remain separately owned and open.

This implements product timing presentation and prerequisite observation,
**not a capacity fix or completion of #653**. It must not close that issue. No Worker limit, model route, execution
budget, provider setting, credential, permission or security setting changes.
The approved #633 budgets remain 512 calls / 8M tokens / $50 / two hours for
new roots; those are per-root limits, not shared provider quotas.

## Fixed observation entry

`node deploy/cli.mjs capacity-observe` accepts no arguments and returns before
image selection/build/pull, runtime-patch checks, staging, draining, convergence,
Worker publishing, migrations or startup. In the existing `Deploy production`
workflow select `capacity-observe`; it skips the image job and uses the existing
Sigillo identity, pinned SSH host keys and `production-deploy` concurrency group.
`stacks` and `run_id` cannot select targets or change the fixed command.

The script executes once in each existing app-a/app-b Worker. It reads numeric
container configuration and the public SDK's loopback `/healthz` and `/metrics`.
It does not instantiate a runtime, query SDK-private tables, call a provider or
enqueue/cancel/retry work. Each HTTP GET has a five-second deadline and 256-KiB
body limit, redirects are refused, each SSH call has a 20-second deadline and
64-KiB output limit. No automatic retry. Missing views survive as null/partial;
absent samples are not zero. Health and metrics are independent reads, not a
transactionally consistent occupancy snapshot. `observed` means readable, not
healthy or capacity-qualified; check `health.ok` and `health.draining`.

The output allows only numeric configuration, four health fields and fixed
numeric metric families with enum/number labels. It excludes worker IDs,
provider credentials, endpoint strings, tenant content, prompts and tool bodies.
Configuration records container values, not proven in-process/frozen-root
limits. Health reports actual task capacity; missing model/reservation settings
stay null instead of being replaced with source defaults. Model concurrency and
reservation defaults require matching the deployed runtime configuration reader.

Allowed metrics describe local active tasks, global queued count/oldest eligible
age, stalled work, event-loop delay, resource admission, attempt execution and
claim recovery. Resource histogram values are process-lifetime cumulative;
compare count/sum/bucket deltas across a controlled interval with restart checks.
They cannot identify a currently blocked model waiter. Durable queue gauges
are duplicated across Workers: **do not sum them across instances**. SDK queue
pending includes delayed work; oldest age excludes future `available_at`.

## Time definitions and current public-interface limits

| Measure | Boundary / interpretation |
| --- | --- |
| Ingress → enqueue | Product ingress receipt to durable enqueue; unavailable from current run list. |
| First eligible → started | `run.started.data.queueWaitMs` for first attempt/request/fence only. SDK21 records it after claim recovery; includes that recovery, not pure lease-acquisition time. Do not rename it lease wait. |
| Delayed availability | Future `availableAt` until eligible; not Worker shortage. Current queued snapshot can distinguish remaining delay and eligible age. |
| Retry / requeue | Later availability / later run.started; retain attempt/fence/request identity. Not reconstructible completely from one bounded event page. |
| Model permit wait | Existing model resource histogram is aggregate admission wait; per-run waiters unavailable pending formal #84 public diagnostics. |
| Execution | `executionMs` sums attempt started→ended/current-time intervals. It can include model permit wait; it is neither model-only time nor end-to-end completion. |
| End to end | Ingress or durable creation→terminal completion receipt, with origin explicit. Missing terminal timestamp stays unavailable; never compute it by adding sums of overlapping execution/model/tool intervals. |
| Generation / correction | Separate occupancy unavailable in SDK21 public capacity readers; #83/#84 own protocol and timing changes. |

Historical first-start sampling must exclude revised/retried runs or report them
separately. A representative queue 151.1s / attempt 55.6s / parallel tools 0.72s
and 1.20s (issue evidence) establishes distinct phases, not a provider or Worker
capacity root cause. The model duration can include local publication backpressure.

## Remaining gates before capacity changes

- Collect effective configuration, actual health/occupancy, queue oldest/depth,
  heartbeat/recovery and model admission deltas in the same bounded interval.
- Obtain provider concurrent/RPM/TPM limits and all shared consumers through the
  existing operator/provider source. No credential or account changes to discover
  quotas. The current public readers do not expose them: **unknown**.
- Capture an isolated, controlled same-model/same-arrival-rate baseline: pure
  interactive, pure background and mixed bursts. Record run count, duration,
  queue/execution/end-to-end p50/p95, successes, timeout/429/circuit rate,
  background progress, cost and resource use. No live-user load is injected.
- After that baseline, before any change, freeze numerical interaction wait and
  background progress budgets and allowed success/cost/429 regressions. Current
  historical convenience samples cannot set a demonstrated capacity budget.
- Implement only the bottleneck supported by the evidence. Do not double
  concurrency, extend timeout, undo #633 or alter pending embedding routing.
- Consume #83/#84 only via a formally published exact SDK public interface,
  retaining absent vs zero and old ledger semantics. No internal-table adapter.
- Keep queue alerts (eligible oldest above accepted budget with sustained depth)
  separate from execution alerts (attempt above accepted execution budget).
  Never alert delayed availability as exhausted Worker capacity; group repeated
  signals per workload/window. Numerical alert thresholds follow controlled baseline.

## Delivery boundary

The draft PR now includes admin/API product timing changes as well as the
observer. The parent thread's designated sole integrator owns merge and production
writes. The earlier observer-only `[skip deploy]` recommendation does not qualify
these product changes for release; coordinate their rollout through normal CI and
health probes. Reviewing or merging the code does not establish a completed
deployment, provider benchmark or #653 capacity acceptance.
A branch workflow observation also does not publish the code to production.

The last completed main CI/deploy at investigation start was
[41603923819](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41603923819)
for dd064748; its deploy job succeeded at 2026-11-03 08:38:48Z. Recheck current
release and active writes before any later deployment. No safe single-writer
handoff has been established for this contributor, so it must not merge or deploy.

## Collected evidence and disposition

[Historical sample](historical-sample.json): list the latest 100 runs (3 leased,
76 succeeded, 8 partial, 13 failed at list time), then read the first 12 turns
and first 12 non-turns through the existing public MCP operations tool, up to
three reads concurrently. Only first-page lifecycle fields/numbers are retained;
raw prompts, tools, identities, event bodies and run IDs are discarded. One of
24 reads was unavailable; four returned full event pages. These are independent
reads, not a consistent snapshot. Observed sample creation range:
2026-11-02 14:58:59.778Z through 2026-11-03 09:08:57.945Z; reads finished at
2026-11-03 09:16:33.850Z. No user runs were enqueued or replayed.

Nearest-rank distributions of valid single-attempt/request/fence samples:

| Observed lane | n | Eligible→started p50 / p95 / max | Attempt execution p50 / p95 / max |
| --- | ---: | --- | --- |
| Interactive | 11 | 186 / 151120 / 151120 ms | 115429.898 / 223739.675 / 223739.675 ms |
| Background | 12 | 173 / 21797 / 21797 ms | 8287.986 / 18838.144 / 18838.144 ms |

The 151120-ms sample was created on **November 2**, with 55614.509-ms attempt
execution; it is not evidence of saturation in the November 3 snapshot. Sample
statuses at inspection: 17 succeeded, 4 partial, 2 failed, 1 unavailable. This
convenience cohort and its tiny lane counts cannot estimate current stationarity,
arrival-rate capacity, all-tenant success rate or queue budgets. End-to-end,
timeout/429/circuit denominators and retry/backoff histories remain unavailable.
These values are not controlled-load or candidate-comparison results.

[Production Worker observation](worker-capacity.json) succeeded in branch
[Actions run 41609773919](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41609773919)
for code `2ca99bdf`, without an image job or deployment. Observed at
09:17:36.883Z (A) / 09:17:37.218Z (B), 2026-11-03:

| Value | A | B |
| --- | ---: | ---: |
| Runtime | 3.8.21 | 3.8.21 |
| Configured task / model concurrency | 2 / 2 | 2 / 2 |
| Configured interactive reserved tasks | 1 | 1 |
| Health-reported task capacity / active | 2 / 0 | 2 / 0 |
| Ready / draining | true / false | true / false |
| New-root calls / tokens / cost-micros / work-ms config | 512 / 8000000 / 50000000 / 7200000 | 512 / 8000000 / 50000000 / 7200000 |

Thus two configured instances expose four task slots in aggregate; these are
per-process limits, **not a global supplier cap or sustainable throughput**.
Both are idle at this instant. Configuration before/after is identical: no
configuration was changed. No new/frozen root budgets were mutated.

The process-lifetime foreground model admission histograms report 22 samples /
0.000180882 total seconds (A), 10 samples / 0.000139476 total seconds (B).
Claim-recovery histograms report 5 / 0.292035007 seconds and 4 / 10.070157356
seconds respectively. These are cumulative process samples with unmeasured
restart/window bounds, not matched to the historical cohort or a controlled
experiment. They do not establish the cause of the November 2 queue delay.

Neither Worker endpoint supplied durable queue/oldest/stalled gauges in this
observation. The separate filtered public queued/leased reader timed out at its
40-second transport bound ([status](queue-snapshot.json)); it was not retried.
Do not infer zero queue, healthy leases or absent backoff from missing data.
Provider concurrent/RPM/TPM and all other consumers sharing that quota remain
unknown. Per-run model-waiter/correction occupancy and exact lease expiry remain
unavailable in the existing public interface. These are concrete blockers to a
safe capacity correction and full #653 acceptance; **no capacity fix is claimed**.

## Validation and review

The environment initially had SDK3.8.16 installed despite the locked3.8.21
manifest. Initial green tests were not treated as21 qualification. The actual
formal3.8.21 registry archive was then fetched with the existing configured
package identity, and SHA-512 exactly matched the root lock:
`sha512-8/AZ1PWiPMF7b0dx6RQ7JHHNnJqDrGAonl4QAXPV6XJZK0ctj85nKG11gcDQHPSjs0wu3BFwxjO43Nv2JuS14w==`.
An isolated local dependency view resolved that exact package without changing
the shared install. No manifest/lock or SDK source changes.

Independent read-only review identified dropped execution `lane` labels. The
new real-label regression failed before the correction and passed after it;
only the formal21 public WorkLane enum is allowed. Review of final code
`2ca99bdf` found no remaining blocker or production-write path. The reviewer
independently reran all29 focused tests against actual21. Node22 local rerun:
29/29 passed; `git diff --check` passed. Owning CI for final code:
[41609715325](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41609715325)
passed deploy-contract and integration; deploy was skipped. Initial-code CI was
cancelled by the updated PR head, not counted as a pass. Subsequent changes only
add these evidence records; final PR-head CI must still be checked.

Public GET probes returned HTTP200 for `/readyz` and the main web origin on
2026-11-03. They verify current service availability, not deployment of this PR.
The sole integrator must coordinate the eventual product release;
this contributor has performed no merge, production configuration mutation,
service drain/restart, image pull or deployment. #653 stays open.

## Product timing correction and controlled public-Worker fixture

The admin detail/operations readers now project only public run snapshots and
public `run.started` fields. The same authorized platform/company detail routes
are retained; no SDK-internal table, export or private trace metadata is read.
The detail's extra first-page lifecycle read fails softly to unavailable timing;
it does not remove the existing run/diagnostic view. Operations cursor reads do
not issue an extra historical read or fabricate a first-start value.

`timing` distinguishes future availability, current eligible queue age, first
eligible→started (only a fully identified original single attempt/request/fence
and seq1), attempt execution total and leased heartbeat age. Null is unavailable,
not zero. Revised/retried roots do not inherit another attempt's first wait.
Exact lease expiry/validity, model-permit wait, ingress delay and terminal wall
clock remain unavailable, without claiming that a lease means a model is running.
The admin labels leased work as **已领取**, execution as **累计执行**, and the
run-list timestamp as **创建时间**. The previous average-completion wording was
incorrect for attempt sums and is corrected without changing ledger values.
The overview queue/waiting counts are scoped to runs created within24h, while
outstanding delivery/usage/memory failures retain their global scope. Queue may
include future availability, so it is not a current eligible queue-depth gauge.

[Controlled fixture](controlled-fixture.json) uses the exact lock-matching public
SDK Worker factory and ModelDriver with six tasks per scenario: pure interactive,
pure background and mixed bursts. All scenarios retain task2/model2/reserve1,
one25ms synthetic model invocation plus a10ms synthetic processor delay per task.
The fixture records actual SDK lifecycle events and attempt intervals; its host
implements public claim filters in memory. It makes no provider HTTP call, has
no billing, persistent database, production tenant or credentials, and executes
no Python. All18 tasks completed; actual task/model maxima remained bounded,
pure-background task concurrency remained1 with progress, and mixed reached2.
The separate slow-model and slow-processor tests inject80ms in each phase and prove
that the measured time is inside attempt execution, independently of queue time.

The fixture JSON retains n/duration and nearest-rank queue/execution/end-to-end
p50/p95/max. Its synthetic host knows its own completion timestamp, so fixture
end-to-end is measured separately; the product API correctly leaves end-to-end
null where that timestamp is unavailable. Model/tool values are not summed to
fabricate wall time. This is a controlled **boundary regression**, not a same-live-
model production baseline or capacity-fix comparison. It cannot establish real
supplier limits, durable lease fencing/recovery, retry/backoff correctness or a
production latency SLA. No production capacity correction is made. Numerical
production budgets and alerts still require the controlled real-boundary
baseline and shared quota information described above.

Checks for this extension: five projection tests cover delayed availability,
cancellation, missing/invalid data, foreign events, cursor pages, revisions/retries,
151s queue vs55s execution and unknown lease validity. Three public-Worker fixture
tests cover three bounded workload mixes, slow-model/slow-processor attribution
and an80ms public recoverWork-hook delay after claim. Recovery contributes to
both eligible-to-started and attempt execution, so adding those intervals double
counts it. This does not qualify durable PostgreSQL lease recovery.
Existing server smoke passed164/164 before these two new test files were added
to its default selection; the new Node22-focused cases passed7/7. Admin tests
passed9/9; server typecheck/lint and admin typecheck/build passed. Existing admin
lint informational notices and bundle-size warning are unrelated. Final candidate
CI and independent review for this extension remain required before handoff.


### Continued validation and environment interruption

The extended default server smoke passed171/171 on ebc2ed03; admin9/9, admin
lint/build and server typecheck passed locally. Independent review found the
24h/global failure-count wording mismatch and it is corrected here. The fixture's
processor delay is now named as such, not described as an actual native-tool call.
The existing runtime-worker-diagnostics HTTP integration is explicitly selected
for these reader/shared-contract changes, with assertions on platform detail,
company detail and operations timing while retaining sensitive-field checks.

The managed execution environment disconnected during the last local work and
became unavailable. The final recovery/owner/HTTP additions therefore require
GitHub CI; no missing local result is counted as passed. These narrow changes
were reconstructed against the pushed ebc2ed03 via repository tools. An inaccessible
local worktree may still contain matching uncommitted edits; reconcile it with
the final remote branch before resuming filesystem work. No production write,
merge, restart or deployment was attempted, and #651 remains untouched.
