# Actual registry-package qualification

These checks load the downloaded, integrity-verified LingxiOS3.5.8 package.
The product code is PR236 head28f7dc5ad27ae3cbd8cf614dad9b055f29bdc412;
later browser-fixture and restore-tool corrections are recorded separately.
No production operation is represented by these receipts.

| Check | Result |
| --- | --- |
| PostgreSQL, native/public Worker, HTTP, SSE and business content | 70/70;116.421s |
| Real migrations46→47/native13→48, failures and no-op | 34/34;80.894s |
| Web smoke plus changed history/transport tests | 69/69 |
| Server smoke plus durable public projection/text safety | 118/118 |
| Web/Node and server TypeScript | Passed |
| Cancelled stream fixture teardown, natural exit | 21/21;2.397s |
| Maintenance, backup and release contracts | 53/53;4.510s |
| Official engine product browser combination | 38/38;137.37s |
| Official engine native content editor/boundaries | 7/7;37.41s |
| Independent source-backup/restore/upgrade rehearsal | 5/5 phases;23.243s in isolated tmpfs PostgreSQL |
| Actual GLM-5.2 + bge-m3 continuity | 1 full scenario,9 behavior checks;79.205s test/81.030s Node test process |

The real-provider run uses a new isolated database,
`lingxiloop_memory_continuity_combined358_test`. All39 observed calls returned200:
28 chat and11 embedding. All39 calls have measured usage. The ledger aggregates
388820 cost-micros over18 roots, with at most6 calls and146075 cost-micros per root.
The existing24-call/300000-token/400000-cost-micro per-root limits were retained.
No retry-to-green, changed provider route, timeout extension or budget increase
was used.

Its direct memory API measurements are separate from the complete scenario:
`scopes`35ms; `list`2 calls,total42ms,max26ms; `read`10 calls,total631ms,max168ms;
`search`31ms. The full scenario includes explicit storage, immediate/new-room
input, indexing, semantic/proactive recall, long-source background extraction,
revision replacement and deletion/index invalidation. Its79-second total is
not a single memory lookup or an explanation of the old207-second Abort.
The old Abort remains unassigned. One sampled lock wait during save is retained;
this run does not prove an absence of all database contention.

The runner's raw `provider-results.json` still contains its historical fixed
“source candidate” label. That conservative label was not edited after execution.
Actual package identity and installation are established independently by the
adjacent runtime358 publication/SRI/474-file proof. Logs and diagnostics contain
timings, counts, fixed labels and synthetic identifiers, not memory bodies or
provider credentials.

## Controlled memory timing

All cells use the isolated PostgreSQL fixture and a deterministic provider.
“First” means first operation in a fresh process/pool, not an OS/database cache
flush. Each warm cell has19 samples; the four-way concurrency result is one
batch. No P95/P99 or general speedup is inferred from these small samples.

| Documents | First list ms | Warm median ms | Warm max ms | Four-way batch ms |
| --- | ---: | ---: | ---: | ---: |
| 0 | 22.77 | 22.85 | 31.69 | 88.18 |
| 8 | 36.07 | 18.72 | 44.69 | 66.53 |
| 1024 | 21.25 | 19.83 | 24.99 | 78.35 |

The retained historical3.5.3 control waited1204.32ms while an unrelated evolution
table was locked for1200ms. The final formal3.5.8 read takes28.69ms under the
same controlled lock, below its unchanged500ms regression budget. Its observer
also proves zero evolution-registration calls on ordinary reads.
The presentation-lock control changes from1208.68ms to165.04ms. These are
specific causal lock-decoupling checks. Historical and final runs have different
timestamps and authorization behavior; ordinary list medians do not establish
a general production speed improvement.

See `memory-latency.json` for individual samples/spans and
`memory-performance-summary.json` for the source hashes and aggregate arithmetic.
The historical raw baseline remains at `artifacts/memory-latency/baseline.json`.

Browser render budgets remain status≤1000ms and receipt-to-paint≤300ms. Final
browser outcomes, including environment failures and their corrections, are
recorded alongside `BROWSER-FIXTURE-NOTES.md`; official-site TLS failures remain
unverified and are not reclassified as passes.

## Browser and fixture provenance

The final product run is `01a158bf-4ced-72e7-a2df-03164f8bb6d3`; native-content
run is `01a158c2-2b81-7897-a1af-a84026e99231`. Their complete official-engine
reports and screenshots are retained here. The browser fixtures load product
components and synthetic HTTP/local-storage data; the separate70-check suite
covers actual business PostgreSQL/HTTP/native Worker paths. Public receipt status
became visible in46.7ms and receive-to-paint took35.8ms, within the unchanged
1000/300ms budgets. These two measurements are not provider/model latency.

The initial no-browser-cache attempt ran zero cases. The next product run
passed36/38: Vite's late public-UI optimization reloaded the timing page, and a
shared KaTeX symlink put fonts outside the serving root. Both failures, reports
and file hashes are retained. A test-only prebundle configuration plus a private,
byte-identical225-file KaTeX copy resolved the setup errors, with no broader file
allowlist or changed assertions. The initial native launch used an incorrect CLI
path and ran zero cases; the final run uses the official `node_modules/.bin/e2e`.
All owned fixture servers were stopped; shared package targets were unchanged.

A final natural-exit teardown command initially omitted the synthetic environment
needed by transitively imported server modules:3 pass/2 file failures before
execution. The corrected command supplies only loopback port9 and synthetic
unit keys;21/21 pass naturally with no forced process exit. This initial setup
failure is retained, not attributed to the product. The normal Web smoke suite
had already supplied the same required defaults and passed69/69.

The captured activity/message JSON files are deterministic synthetic Worker
fixtures. They are preserved separately here so the historical fixture files
remain unchanged. No real user memory or provider credential is captured.

## Review and remaining gates

Independent restore implementation873f9fd3 and evidence head d55d2034 passed
review after fixing a URL query/fragment override in the test harness. Actual
formal3.5.6 initializes product46/native12,174 tables restore byte/row-equivalently,
then formal3.5.8 advances47/native13 and48. An injected isolated48 failure leaves47
and requires fix-forward; old3.5.6 readiness/startup rejects native13. Historical
memory, CAS, principal/tenant boundaries, revoke/delete/restart and no-op behavior
pass. This23-second fixture does not estimate production maintenance downtime.
See the separately committed `issue216-independent-restore` evidence and review.

PR234 and PR235 independent reviews found no remaining P1/P2 in their bounded
documentation/measurement scopes. Their limitations remain: official-site TLS,
native OS/clipboard/touch and unproven dependency-removal candidates are not
acceptance passes. #229 remains open. The first PR236 CI at28f7dc5a passed five
component checks but integration had338 pass/2 fail/13 skip; the failing old
group-scope and learner-prefix assertions are corrected in3aa256da against the
public contract, with independent2pass/2fail red and4/4 green evidence. Current
membership, private-scope exclusion, role isolation, same-learner cross-room
continuity and exact independent approval/ledger assertions are preserved or
strengthened. Product code and runtime did not change for this correction.
See `docs/evidence/pr236-scope-contracts/`. Final exact-head CI and immutable
image qualification remain required. No production service was stopped, backed
up, migrated or deployed by these checks; maintenance authorization remains
pending with the coordinator.
