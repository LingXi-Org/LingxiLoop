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
times and comparable end-to-end speed remain unmeasured. The user subsequently
chose manual YAML upload; online retrieval is no longer a prerequisite. The approved design is
`docs/release-mihomo-activation.md`; B's Docker live-restore is disabled, so a
daemon proxy change has concrete shared-service impact and must be explicitly
qualified/authorized before touching healthy production. No such change occurred.

Actual read-only A/B metadata subsequently confirmed both `/etc/lingxi-release`
and `/etc/lingxi-release/secrets` directories exist, root:root0700, no symlinks.
The approved upload destination on each is
`/etc/lingxi-release/secrets/mihomo-provider.yaml`, root:root0600. Both provider
files, binaries, configs and systemd units were absent; service LoadState was
not-found/inactive. No provider content was read. User upload completion is
pending; it does not authorize a daemon proxy change. Canonical `run.sh route-check`
now performs this metadata-only inventory; optional online checking is separately
named `subscription-check` and is not a publish gate.

## Actual route qualification, 2026-10-26 06:56–07:08 UTC

User-approved native Mihomo v1.19.33 is active on both hosts, only
127.0.0.1:17890. The original uploaded provider remains root:root/0600;
a separately approved atomic filter excluded its five TLS-bypass nodes and
retained 40 unchanged nodes. Normal TLS verification remains on. These samples
precede any Docker proxy change and never loaded or switched an image.

Same immutable historical server image, config
`sha256:a49c1c6925cbd4644e793785143b37e17b8257ae8c3393aa38dee606fd6d1739`,
three concurrent transfers, no local download cache. Registry fetches verify
31 OCI objects / 174106600 bytes; R2 fetches verify the 174221560-byte archive
and 21 parts. Edge cache state is unknown. Full receipts: [route-benchmarks.json](route-benchmarks.json).

| Host / route | Absolute duration | Outcome | Verified bytes | Automatic retries |
| --- | ---: | --- | ---: | ---: |
| A registry via loopback | 133.644s | Complete | 174106600 | 0 |
| A R2 direct | 186.092s | Incomplete: original 180s work deadline plus bounded socket cleanup | 165832952 | 0 |
| B registry via loopback | 119.465s | Complete | 174106600 | 0 |

Registry complete samples **2**, comparable R2 complete samples **0**. The
incomplete R2 sample is not a successful release and supplies no exact speedup
factor. Preliminary concurrency-one samples also exceeded their budgets
(A registry180.077s, R2 181.218s); do not compare them as concurrency-three
speed improvements. Each sample was one deliberate operator invocation;
zero automatic retries within the measurements does not imply zero manual
interventions across proxy installation. Native A installation initially
refused TLS bypass before writes, and start validation/readiness required
explicit corrective work and readback; these are not a one-shot success claim.

Measured route choice favors registry through the approved proxy. Remaining
qualification: actual Docker pull/load, immutable new build distribution,
application switch, accepted controller record, and controlled recovery.
Accepted new production release sample count remains **0**. Production
end-to-end improvement, reduction percentage and p95 remain unmeasured.

Static retention now batches at most eight small business assets/256KiB per
request, with SHA256 checks, at most32 R2 subrequests, publisher/admin auth,
immutable conditional writes and a 16-minute overall budget. This retains
business assets; it does not commit to retaining R2 image distribution.
Local batch Worker regressions2/2 and TypeScript passed; local client regression
includes lost write response, denied auth, source drift and excessive Retry-After.
Actual Worker Free CPU and staging time still require production qualification.

## Daemon maintenance qualification is not release acceptance

The user approved the three daemon proxy fields on A/B, B live-restore via
reload, one serial daemon restart per host, and controlled restoration. A's first
attempt failed: live-restore already came from a CLI flag, and the initial helper
incorrectly duplicated it in JSON. `dockerd --validate` without the real flags
missed this conflict. A was restored to exact original configuration hash
`0890389a57b59b790352edc9e982369e9e0433d3600c519bbf76165f1e6d24ce`;
all six container IDs, image IDs, start times and mount identities were verified
unchanged, healthy, zero operations/reservations. API meta/health returned200.
Restoration's initial health lag required readback and continuation, not a second
restoration restart. This is a real failed maintenance attempt with operator
intervention, not automatic one-shot success.

B stopped before daemon mutation when unordered Docker inspect mount arrays
produced different hashes. Read-only evidence proved all ten original container
identities and the complete unchanged mount sets; only array order differed.
The prepared intent was explicitly closed with unchanged original configuration
and no restart. The helper now canonicalizes mount order and validates existing
legacy receipt hashes by bounded exact permutations, never ignores mount drift.
A separate corrected attempt retains those prior records and its own deadline.
The candidate now validates with actual daemon flags. Additional A restart
permission was requested because its initial approved attempt was consumed.

Subsequent actual maintenance readback: both A and B now report phase `complete`,
proxy active and live-restore enabled. A candidate config hash
`835a0520ed23eb8fa822d65649009b23c5986c0da9589917ed0d8c635eb5a6c3`, B
`fa0360e3bd7669065150091ea0a4c2623c4f91d4911466b7071008ebb7a3aa2a`.
A's additional corrected restart was explicitly approved separately. B had one
actual restart; its initial prewrite failure performed none. Docker's actual
`HttpProxy`/`HttpsProxy` casing initially caused a false unconfirmed receipt;
a read-only observation then proved the active settings, and continuation
completed the receipt without repeating the restart. Local regression now uses
those actual field names and tests mount-order equivalence versus real RW drift.
All6 A/10 B container identities, start times, image IDs and complete mounts
were checked; host pending operations/reservations0. No product version switched.
These manual repairs and extra authorization are recorded failures/interventions,
not an automatic first-success or end-to-end release qualification.

## Actual daemon pull and route retirement

A single immutable registry pull on A completed with the existing canonical
OCI verifier in **7.845s**, including load and identity readback, one pull attempt.
The canonical reference was absent beforehand; layer cache state is unknown.
B's pull exited successfully; its initial benchmark verifier wrongly assumed
Docker's local ID must equal the config digest. Docker29 instead exposed the
verified index ID. No second B pull occurred: canonical read-only verification
completed later. Its first command/failed-verification interval was13.521s;
completion of qualification required the later readback (0.670s operation,
07:38:36.873UTC start). Do not describe13.521s as a self-contained successful
qualification or compare either warm/unknown-cache value against cold downloads.

The canonical verifier proves index
`sha256:59b699b4bf3941521c08d2d36890675caa8aad52882b46ff457abe62f025ee1b`,
platform `sha256:ff39d11ffd4ff08d315ade1548c49f6414d268aa27a2ea5fcead8b8307369fdc`,
config `sha256:a49c1c6925cbd4644e793785143b37e17b8257ae8c3393aa38dee606fd6d1739`,
and28 ordered uncompressed layers on both hosts. These were download/load tests;
no application was switched and neither sample is an accepted release.

The selected candidate removes CI image archive save/compress/upload, the host
R2 downloader/loader and part-upload RPC. Explicit registry policy checks the
actual daemon proxy before bounded pulls. Historical source image receipts and
all database/business R2 data remain. Legacy relay code is a test fixture only.
Installed executors/policies still require the final exact qualified rollout;
repository cleanup alone does not claim the production publishing path changed.

## Ops288 single-command recovery (2026-10-26 13:10 UTC)

[Retained measured receipt](ops288-recovered.json): one invocation, one submission,
292.655 seconds to `recovered`, zero client retries and zero manual controller
interventions. The controller automatically restored the exact source after the
final archive upload failed; no target migration/application was performed. The
new diagnostic observed a 576 ms transport timeout without an HTTP response,
then metadata404. Its lower-level code was not retained by Ops288, so neither a
300-second budget exhaustion nor a specific network root cause is established.
The immutable R2 recovery receipt and five HTTP200 probes were verified;106
Workflow instances were all terminal and both host operation/reservation counts
were zero. Production remains197e2568/SDK3.8.12/product57. This is not an accepted
sample or an end-to-end speedup claim. Cached image preparation is not comparable
to the historical cold distribution samples.

The follow-up keeps the existing upload deadline, permits at most one transient
transport retry after an absent readback, releases unused error response bodies,
and retains both attempts and allowlisted transport codes. Authentication,
quota, TLS, identity and permanent DNS errors do not retry. Local fault tests are
qualification evidence; production success is still required.
# Ops036: confirmed archive, retained-checkpoint refusal

The single-command attempt `gh-40294374039-a1-80b5bcb32f1c-ops036-business`
recovered its source in 524.998 seconds: 479.049 seconds summed stage execution,
41.709 seconds stage queue, one submit, zero client retries, one automatic source
recovery and zero manual controller interventions. Approval waiting is excluded.
The 73,238,793-byte backup uploaded with HTTP201 in 214.918 seconds on its first
attempt. Isolated restore/schema/count verification and cleanup completed, then
the read-only SDK source preflight refused before any migration/CAS intent.

[The read-only diagnosis](ops036-checkpoint-barrier.json) checks the exact retained
dump hash, fixed migration/image/destination predicates and source receipt. Offline
archive decoding found 864 work items, 349 bound work items, and exactly one
unfinished `turn:waiting` with `runtime.binding`/`runtime.checkpoint`. The SDK57
predicate counts this as `incompatibleRuns=1`, despite all live-lease counters
being zero. No production database connection was opened for this diagnosis;
no task IDs, prompts, bodies or credentials were exported.

The old outer handler discarded the inner exception, so this proves a sufficient
data-state rejection rather than reconstructing a lost exception. The fix checks
the same predicate in prepare/drain before writer stop, retains the final SDK
guard, and does not block source recovery. It does not cancel the retained task
or authorize a runtime upgrade. The task must reach a supported terminal state
under the source runtime before a new attempt; no checkpoint deletion is implied.
Production remained SDK3.8.12/product57 with five HTTP200 probes, zero host inflight,
and a verified durable recovery receipt. Successful production samples remain zero;
this recovered run is not an accepted-release speedup.
