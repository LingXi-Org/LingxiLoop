# #653 queue and capacity baseline — incomplete acceptance

Base: `dd064748a6c9f8f96c1963d508471b0376639707` (2026-11-03). No assignee
or related PR existed at initial issue/comment/PR lookup. The single comment
was the task-email receipt. #646/#648/#649 are user-owned; no files from those
changes are edited here. LingxiOS #83/#84 remain separately owned and open.

This is a prerequisite observation change, **not a capacity fix or completion of
#653**. It must not close that issue. No Worker limit, model route, execution
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

Open a draft prerequisite PR. The parent thread's designated sole integrator
owns merge and production writes. Use **`[skip deploy]` in the merge commit** for
this observation-only prerequisite. Review/merge of the observer does not
qualify a capacity change, deployment, provider benchmark or #653 acceptance.
A branch workflow observation also does not publish the code to production.

The last completed main CI/deploy at investigation start was
[41603923819](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41603923819)
for dd064748; its deploy job succeeded at 2026-11-03 08:38:48Z. Recheck current
release and active writes before any later deployment. No safe single-writer
handoff has been established for this contributor, so it must not merge or deploy.
