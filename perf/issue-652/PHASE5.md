# #652: Design namespace reduction and measured initialization

Continuation of draft [PR #658](https://github.com/LingXi-Org/LingxiLoop/pull/658).
This is a staged change, **not completion of #652**. The fixed cold p75 goals
remain Design **2786.25 ms**, Slides **1761.6 ms**; retained reopen **300 ms**.
Both cold goals remain unmet. [Phase 4](PHASE4.md) evidence is preserved.

The measured product source is `e6dc55ca78128f0b9b6d5bddb09231159cc4da96`.
Subsequent build guards reject direct eval and escaped factory references;
[an exact-entry comparison](evidence/phase5/guard-exact-entry-final.log) proves
that those guards produce the identical qualified browser entry. The
[provenance](evidence/phase5/provenance.json) records both manifests and
source-head CI. All browser documents, grants, installed systems and ACLs
here are synthetic. This is not a production-login qualification.

## Product change and review boundary

The Design browser namespace has 10,664 getter registrations. Symbol-bound
inspection verifies its sole constructor caller ignores its returned
namespace; factory parameters cannot escape through computed access,
aliasing or arbitrary calls. All 663 factories still install and initialize
in their original order. The builder replaces **6,077 unread registration
expressions** with `void 0`. It keeps a conservative superset of referenced
property names and string literals. It does not rename or minify callable
implementations, remove native functions, mark initializers pure, or change
native source-data programs. Factory bodies contain the registration
replacements; the source-string implementations consumed by capture and
other native features remain intact.

The builder fails on constructor/factory exposure, direct eval (including
parenthesized eval), computed namespace access and unreviewed receiver
calls. [Red/green eval](evidence/phase5/design-eval-before.log) and
[factory exposure](evidence/phase5/design-factory-before.log) regressions
cover gaps found while reviewing the initial guard. The eight existing
receiver calls are explicitly listed; their pinned native function/arrow
bodies and hashes are in the [receiver audit](evidence/phase5/receiver-audit.json).
They do not use `this`. This audit concerns the current source: an upstream
change still needs review of actual mutable alias writers and implicit
receiver behavior.

| Design main entry | Previous `a80e6589` | Candidate |
| --- | ---: | ---: |
| Source bytes | 5,504,067 | 5,280,558 |
| Brotli bytes | 1,381,265 | 1,327,781 |

The Brotli reduction is **53,484 bytes / 3.9%**. The four required source
programs add the same 158,263 Brotli bytes. The combined 1,486,044 bytes
alone require about **2.97 s** on an aggregate 4 Mbps connection, before
CSS/fonts, latency and CPU. This is a transfer calculation, not another
browser measurement. It demonstrates why this change cannot satisfy the
2.786 s Design target by itself.

Slides product code is unchanged in this continuation. Its generated file
hash map exactly matches Phase 4. A reachable-consumer pruning experiment
produced no output-byte saving and was discarded. A stricter Design
unreferenced-function experiment removed only ten functions / 2,364 Brotli
bytes; it also was **not shipped**. Neither experiment is counted as a
product improvement.

## Actual native format and recovery checks

The new [typed-component check](typed-components.py) installs a real local
bundle and `.d.ts` declarations following the native `x-import` contract.
Only the optional property worker's first HTTP response is 503. Native
re-selection retries through the actual gateway, SRI and CSP. The test
retains an unconfirmed heading edit in the same host and guest documents,
edits the inferred enum, saves through native CAS, and reopens with both
changes. Installed files, canvas metadata and the component source remain
intact. User bundle/picker execution stays in the checked child, not the
grant host. [Desktop evidence](evidence/phase5/typed-components/browser.json.gz)
and [768 px evidence](evidence/phase5/typed-components-narrow/browser.json.gz)
both pass with zero page errors. The original value-only fallback remains;
this change does not add a new property UI or worker retry protocol.

Affected Design qualification also passes:

- Ordinary writable edit/save, readonly, formula first-failure/retry, native offline self-contained HTML and PNG capture; [log](evidence/phase5/design-standard.log) and [output](evidence/phase5/design-standard/design-offline.html). This existing checker intercepts its synthetic API, unlike the HTTP/gateway tests above.
- Two native draft scenarios at each of [desktop](evidence/phase5/design-recovery-desktop/browser.json) and [768 px](evidence/phase5/design-recovery-narrow/browser.json): expiry capture/explicit acknowledged restore, and write downgrade/download-only recovery followed by read-revocation cleanup. No unauthorized automatic save or document replacement is accepted. Changed-base refusal remains covered by the earlier owning recovery checks; it was not a new browser scenario here.
- Owning Design suite **13/13** on the measured source; final guard regressions **2/2** plus exact output proof. [Owning log](evidence/phase5/design-final-units.log), [final guards](evidence/phase5/design-factory-after.log). Scoped Biome exits zero with two existing literal-template warnings; Python tools compile.

[Source-head CI 41698521879](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41698521879)
completed successfully: Web, server, integration and deploy-contract.
Deployment was skipped. This formal tree also reruns the actual PostgreSQL,
Redis and artifact-policy boundary checks introduced in Phase 4. See the
PR checks for the subsequent guard/report commit; the recorded source CI
must not be relabelled as a run on another commit.

## Cold and retained measurements

Chromium 154.0.8037.57, HTTPS/Brotli, 1440×1000, recursive target throttling
20 ms / 4 Mbps, CPU 1. Ten alternating pairs, **60 actual Design opens**,
with visible native canvas and trusted double-click entering editing as
the endpoint. No concurrent builds or other browsers. The control is an
isolated rebuild of `a80e6589`; its generated file hashes exactly match the
Phase 4 manifest. It is not the original issue baseline.
[Raw requests/timings](evidence/phase5/paired-design.json.gz),
[assessment](evidence/phase5/assessment.json),
[wire accounting](evidence/phase5/resources.json).

| Design scenario | Control p50 / p75 / p95 ms | Candidate p50 / p75 / p95 ms |
| --- | ---: | ---: |
| Cold | 4651.4 / 4683.8 / 4692.3 | 4649 / 4665.5 / 4686.8 |
| Warm new frame | 1057.1 / 1071.9 / 1084.1 | 1075.4 / 1088.3 / 1103.1 |
| Switch artifact | 1190.2 / 1201.6 / 1217 | 1189.7 / 1196.2 / 1214.9 |

Cold p75 is only **0.4% lower**; this is not evidence of a substantial
latency improvement. The Design staged regression gate passes; the fixed
cold target fails. Five initial JS/source-data requests transfer median
1,488,350 encoded bytes, versus 1,541,834 for control. CSS is one request /
53,295 bytes and font one / 48,339 bytes in both arms. Encoded counts include
headers; source-data Fetch requests are counted as JS. Slides cold was not
remeasured because its bytes/code are unchanged; its Phase 4 3310.2 ms p75
remains historical evidence and still fails the 1761.6 ms goal.

Forty actual retained opens (ten/editor/viewport) preserve iframe, proxy and
native document identity, request fresh authorization, and transfer zero
new scripts. Frame eviction disconnects both and reopening creates a new
native document. [Desktop](evidence/phase5/retained-desktop.json) and
[768 px](evidence/phase5/retained-narrow.json):

| Retained p75 | Design | Slides |
| --- | ---: | ---: |
| Desktop | 198.3 ms | 221.2 ms |
| 768 px | 205.9 ms | 215 ms |

Hidden Chromium process-family PSS was **550.44 / 584.49 MiB**
(desktop/narrow), **538.3 / 585.83 MiB** after removal, and **361.66 / 355 MiB**
after explicit host GC and releasing test references. Hidden CPU was
**0.05 s per 5 s** in both; visible Slides CPU **0.18 / 0.11 s per 5 s**.
These observations do not establish a browser byte cap or immediate memory
return. The existing count limit remains one Design plus one Slides, with
current-tab recovery copies bounded separately. Retained success never
substitutes for the cold target.

## CPU evidence and remaining core contracts

Diagnostic CDP [Design](evidence/phase5/design-profile/summary.json) and
[Slides](evidence/phase5/slides-profile/summary.json) profiles on `a80e6589`
include actual native editing, with raw CPU profiles and timelines retained.
Design sampled self CPU attributed to the main entry is **765.2 ms**;
`nW` accounts for **120.6 ms self**. Idle, unattributed `(program)`, compile,
render and nested event durations must not be added together as CPU.
Streaming parse events include waiting for bytes. These profiler runs carry
overhead and are **not timing acceptance**.

The [diagnostic copy builder](design-init-profile.mjs) and
[runner](design-init-profile.py) add explicit timing around every native
factory install and initializer. They never alter the qualified/product
asset directory. Three alternating diagnostic opens per arm verify all
**663 installs + 663 initializers** ran. [Raw timings](evidence/phase5/factory-timings.json.gz)
and [summary](evidence/phase5/factory-timings-summary.json): median total
registration time **62.1 → 46.6 ms**, initialization **106.4 → 111.6 ms**.
This does not show an initializer CPU reduction. The largest current
initializer medians are theme/CDS setup `Pj` **23.1 ms**, numeric scrubber's
Intl setup `iB` **12.9 ms**, and application bootstrap `aW` **7.9 ms**.
[Native exports and initializer tails](evidence/phase5/hot-factories.json)
identify those concrete consumers. Timers perturb execution and exclude
asynchronous React/guest work after the initializer returns; this is not
complete renderer CPU attribution.

Further core splitting remains required:

1. Design's canvas shell (`tG`, ~375 KB source), editing/inspector session (`l9`, ~165 KB), and React DOM (`lA`, ~213 KB) still share the synchronous namespace. The inspector is embedded in a live editing session; moving its file alone cannot defer its closures or initialization. An asynchronous property/code-panel boundary must preserve the live selection, pending script and native undo/save flow. The React root and actual first guest remain required.
2. Required picker/support source strings now have explicit preparation, but they still prepare before the first native guest. Deferring their consumers further needs a guest initialization/command-readiness contract with failure and retry, preserving source serialization, selection, capture and offline assembly. Treating these first-guest programs as optional would break actual editing.
3. Slides still eagerly initializes 288 factories. The actual esbuild inventory identifies `support.js` (~821 KB of output contribution) plus compiler/canvas/app dependencies on the first-view path. The compiler serves synchronous Node callers as well as browser landing-slide rendering. Further browser capability boundaries must preserve its public output and the full-compose/CAS protocol; dropping a static registry or delaying all compilation is not an implementation of that contract.

These are unfinished contract changes, not a reason to close #652 because
upstream is bundled. Broader historical-format permutations, complete CPU
attribution and **independent review of the final candidate** remain gates.
No merge, deployment, production-host validation or cross-version Docker
qualification was performed by this contributor. The designated sole
integrator owns release coordination.
