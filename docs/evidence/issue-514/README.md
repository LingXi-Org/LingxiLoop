# Issue #514: measured baseline and bounded release candidate

Candidate starts from main `b9e6d169f0a0e94d7b674f4100502e39b1f2503a`.
No browser acceptance is required. Production acceptance and speedup are not
established by this development record.

## Actual baseline

The adjacent run/job JSON files are selected verbatim GitHub metadata fields,
collected through authenticated read-only REST on 2026-10-26. Timing reports
are reproducible with `scripts/release/timing-report.mjs ci RUN JOBS`.
Skipped jobs, negative provider timestamps, and inherited previous-attempt jobs
are excluded from execution. GitHub relabels some inherited jobs as attempt 2;
the report also checks the real timestamp window. Summed runner seconds are not
wall time. Queue totals below sum each job's created-to-start interval, and do
not establish approval duration (unknown).

| Run / scope | Attempt | Result | Attempt wall | Sum runner execution | Sum job queue |
| --- | --- | --- | ---: | ---: | ---: |
| [40259575306](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40259575306), checks + four images, publish-only | 1 | CI success; no deployment | 401s | 1019s | 21s |
| [40268735816](https://github.com/LingXi-Org/LingxiLoop/actions/runs/40268735816), checks + images + static staging | 1 | Cancelled | 994s | 1707s | 24s |
| Same staging run, failed-job rerun | 2 | CI success; no deployment | 606s | 601s | 3s |

Staging elapsed 04:22:24–04:50:38 = **1694s (28m14s)** across both attempts.
First `prepare-static` ran 764s; its upload step ran 633s and was cancelled.
The successful second job ran 601s; its upload step ran 430s. The interval from
first job completion to second job start was 99s, not execution or proven
approval time. There is one user-triggered failed-job rerun. First/second cache
conditions differ; 633→430 is **not** an optimization speedup. Samples: one
publish-only run and one staging run with two attempts; no p95.

The original publisher supplied Library `libfile_ee341e4525d08191b4ac8560539978c8`,
version 0, 325756-byte archive, SHA256
`9047dca5b24db1f2022d88d51a486b867c92c7f1686dab6b91ca45d6f968a80d`.
The archive and every listed file checksum were verified locally. Private raw
records stay outside Git; `gen8-timeline.json` contains only selected operation
identities/times/errors, with no configuration, credential or business content.

| gen8 stage | Observed time | Meaning |
| --- | ---: | --- |
| Submit→recovered terminal | **3786.144s (63m06.144s)** | Recovery outcome, not accepted candidate; includes coding, CI, operator/approval/external waits |
| A prepare | 144.643s | Host operation created→updated |
| B prepare | 151.219s | Sequential after A; same archive, independently downloaded/loaded |
| A/B prepare envelope | 299.689s | 04:58:14.702→05:03:14.391 |
| A drain / B drain | 9.861s / 10.082s | Concurrent host operation wall time |
| A apply | 20.026s | Failed READINESS_UNPROVEN, fixed by #512 |
| A final recover | 39.746s | Prepared compatible recovery |

One 174221560-byte archive, 21 parts, SHA256
`10a367dfe2f49561381a59b6a58c5dad7b10f658f871900977745ce2d616be72`.
B recover's created→updated interval includes the failed original request and
manual continuation; it is not 22 minutes of actual Docker execution. Individual
step timestamps are retained. Two explicit admin resumes are documented;
combined with CI, **at least three manual interventions**. Other operator actions
and original automatic retry counts cannot be reconstructed completely and are
unknown, not zero. Approval/external outage/coding intervals cannot be precisely
partitioned from these receipts. The observed original endpoint failure was
CONTROL_UNAVAILABLE, not proven credentials rejection.

At 06:06:18 UTC: zero in-flight Workflows, no active production CI, host operations
and reservations zero; seven healthy containers, retained mounts, ingress gen8
enabled, native14/product57/SDK3.8.12, business restored to `197e2568`. Current
accepted ledger is the prior accepted release. The cumulative business batch
and PR491/510/511 are not thereby accepted. Direct remote DO lock counts were
not available; recovered terminal semantics release DO locks transactionally.

## Candidate and executable budgets

The canonical Skill calls **`scripts/release/run.sh`**. It loads the existing
provider, derives the existing reviewed controller domain, checks exact app/Ops
CI and the actual immutable release before any mutation, then submits once and
observes the automatic controller recovery chain. It emits a private atomic JSON
checkpoint and JSON/human summary. Same-command restart retains the original
40-minute observation deadline. Timeout means unverified remote outcome, not
cancellation, failure, success, or permission to create another release.
Explicit resume/recover use this same entry and existing admin role; uncertain
responses must prove a changed Workflow identity before continuation.

Runtime preparation overlaps A/B generation-zero work. All outcomes settle
before claim/drain; DB and service switches retain their safe order. Based only
on the historical preparation times, ideal overlap would reduce the 299.689s
envelope toward 151.219s (1.98×, 49.5% reduction). This is a **projection**, not a
measured production result; shared throughput can reduce the benefit. The
existing 32-request stage allowance and 900s phase deadlines remain enforced;
long preparations can still exhaust the shared allowance and stop explicitly.

Static retention reuses the unmerged #495 pacing helper from
`cf32eb47005c6a7e0a1e5510734aa675657cf3dd`: three tasks, one shared 350ms GET/PUT
cadence. Full sorted path/SHA256/size group receipts permit already verified
immutable groups to skip per-object reads on subsequent runs. New groups commit
their receipt only after every member succeeds. No retained object is deleted.
Changed files invalidate their group; changed source bytes fail before upload.
Object retries have three attempts/60s, read back after lost PUT, respect
Retry-After, and stop on authorization, hash, redirect or permanent failure.
The stage has a 16-minute budget and CI job 20 minutes: 1126 cold objects alone
need about 13.1 minutes at the retained cadence, making the old 12-minute job
limit impossible. A cold first qualification is not promised faster than a warm
historical retry. The intended steady-state gain is fewer requests, not quota
avoidance. Both historical and new actual warm/cold sample sizes must be stated.

Control HTTP GETs retry transient transport/429/500/502/503/504 at most three
attempts, with backoff/jitter inside the existing read timeout (default 10s).
POSTs, helper execution, redirects, bad evidence and 401/403 are not replayed.
Per-operation read counters/timing persist in the existing journal. The fixed
ingress write's unknown reply is still independently read back by generation.

Workflow retry permits, stage queued/start/end times, claim deadline and manual
resume count persist in SQLite. Dispatch has 20 attempts/5 minutes and stops
with explicit blocked/unknown outcome while preserving identity and ownership;
authorization/quota denial stops immediately. Budgets are safety bounds, not
claims that a platform outage can always recover automatically.

## Validation and open gates

Current saved environment: `scripts/release/run.sh doctor` actually returned
`read-only-preflight-passed`, Node22.23.3, prior accepted release, zero production
writes. The provider had tokens but no API URL. GitHub Variables GET returned403
and was not retried; the script now reuses the tracked approved custom domain,
which the authenticated controller read verified. No credentials/network changes.

Focused regressions cover normal/automatic recovered chains, uncertain submit,
restart, original budget, denied preflight, ambiguous admin command, lost upload,
group reuse/invalidation, bounded pool, Retry-After, control failure, parallel
preparation and persistent SQLite retry/dispatch state. Existing host tests
cover process-crash readback without side-effect replay and retained volumes.
Cloudflare workerd falls back from compatibility date2026-09-01 to2025-12-17;
these tests are not live provider qualification.

The earlier `loopback-transfer.json` is an **unpaced pool-only** controlled
loopback microbenchmark (32×16KiB objects,10ms injected delay,three pairs per
cache mode), not the final paced/group-cache implementation or production.
It cannot substantiate a production speedup and is retained as a limited earlier
experiment, not the acceptance metric. No production after-sample exists yet.

Remaining: exact candidate CI, current zero-inflight readback immediately before
operations rollout, synchronize final selected controller/executor/GitHub Ops
identities through authorized existing routes, then one-command normal and
controlled automatic recovery qualification with real receipts. GitHub Variables
writes were previously denied; send the exact selected final value to the parent
for its authorized local route, never retry that denial from cloud. PR491's
SDK3.8.13 CAS57 candidate still needs formal-package PG and executor integration;
510/511's existing exact CI is reusable. Keep business issues open until their
actual acceptance requirements are met.

Local candidate checks (2026-10-26): TypeScript passed; Node owning suite207
passed/4optional skipped; Worker78passed/2optional skipped. Actual one-command
`preflight` of the handoff manifest completed in1.693s, no retries or production
writes, and read back gen8 recovered with the original final Workflow identity.
This is preflight evidence, not a new release or normal/recovery qualification.

## Latest distribution decision and actual blocker

The user's later instruction removes any requirement to retain R2 publication:
choose the fastest reliable measured route; replace R2 distribution with Clash
if needed, retaining business data/assets and historical recovery evidence.
Do not claim the R2 candidate is the final selected route before that comparison.

Current-cloud `scripts/release/run.sh route-check` used the existing injected
subscription and normal TLS, returned **HTTP503 in1083ms**, one request, no node
configuration obtained, no provider saved or proxy activated. Earlier handoff
reported cloud503 and Cloudflare526. These are unavailable candidates, not speed
samples. No TLS exception, identity switch or denied-action retry was attempted.
Authenticated Clash registry/blob throughput, build/distribution/load/switch
times and comparable end-to-end speed remain unmeasured. A working subscription
is required before selecting/installing that path. The approved design is
`docs/release-mihomo-activation.md`; B's Docker live-restore is disabled, so a
daemon proxy change has concrete shared-service impact and must be explicitly
qualified/authorized before touching healthy production. No such change occurred.
