# Combined runtime and harness candidate

This candidate combines product main ab31390b, the product62 formal24-to25
bridge and queue gate from #688 (110c2e4a), and the Visualize retirement and
Design explanation changes from #672 (4af689c9). It has not been deployed.

The integration preserves both sets of behavior: saved Slides title/count
observations and incremental writes, Design planning/authorized initialization
and checked-board receipts, the current upload helper packaging, and teaching
context. Generic publicTextSafety rejection/approval remains the first boundary;
Design and teaching checks only impose additional constraints.

Four merge conflicts were resolved: artifact-tool imports/descriptions/check
schema, shared skill guidance, historical integration dispatch, and a Slides
test comment. The formal25 historical-package dispatch remains, together with
the existing opt-in live-artifact timeout. Both Design and Slides tests remain.
The deployment workflow, Dockerfile and product context equal the reviewed
#672 versions based on ab31390b. Scoped dependency profiles match the root lock.

Local deployment, selector and bootstrap-guard checks pass 43 tests. The first
selector/bootstrap attempt lacked node_modules and failed four cases at import;
after linking existing dependencies, the affected ten cases passed. Those
dependencies contain an older SDK: these local guards are not formal25 native
qualification. The combined commit must pass exact-lock CI, including the
product62 PostgreSQL queue/recovery and affected native Worker cases, before
independent final review and production integration.

The first combined CI (41868217168) passed web, control, server, admin,
deployment-contract and the native Design/teaching cases, then failed before
the public-text suspension behavior ran: its explicit supported-version list
ended at 3.8.24. Formal25 now runs all four existing suspension controls,
including invalid replacement rejection and formal24-style output callback
failure attribution, timing/ledger and publication assertions. The formal25
upstream changes do not alter the model/publication implementation exercised
by those controls. The corrected final commit still requires exact-lock CI;
the failed run is not qualification.

Use one controlled formal24-to25 maintenance cutover for both harness changes.
The reviewed gate must count every queued, leased and waiting item, even when
no binding/checkpoint exists; recheck under the maintenance lock after both
source APIs and Workers have stopped. Retain queued work on a known-source
refusal and restore the exact source without replaying CAS. Unknown outcomes
retain maintenance. Do not rewrite harness pins or silently cancel old work.

Original production-account, provider reliability/performance, browser/Office
and cold-start/capacity acceptance remain bounded by the two source reports.
Synthetic fixtures and an exact-lock CI run do not qualify those missing cases.
