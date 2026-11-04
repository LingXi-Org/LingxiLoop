# #652: native preparation, properties, themes and permission checks

Continuation of draft [PR #658](https://github.com/LingXi-Org/LingxiLoop/pull/658).
Final product source is `6dc33353`; owning test refinements continue through
`7228ea73`. The measured earlier wrapper source is `803cca66`. This does **not** complete #652.
Historical [Phase 2](PHASE2.md) and [Phase 3](PHASE3.md) evidence is preserved.
The fixed cold p75 goals remain Design **2786.25 ms** and Slides **1761.6 ms**;
a retained reopen has a separate **300 ms** goal.

The [source/build provenance](evidence/phase4/provenance.json) and
[actual dependency/initialization inventory](evidence/phase4/inventory.json.gz)
identify this continuation. All browser documents and grants are synthetic.
The authorization integration below uses actual HTTP routers, PostgreSQL,
Redis and product policy, with fixture session identity and WuKong transport.
It is not a production-login or production-ACL qualification.

## Native loading changes

**Design.** Four original UTF-8 source programs (React, ReactDOM, support and
picker; 864,582 bytes total) now have exact SHA-256 names and browser SRI.
They remain source data for the original synchronous native consumers. A
trusted-shell preparation boundary fetches these fixed public resources
before native initialization, concurrently with the main entry. The original
module resumes through top-level await, without a function around the entire
entry. Runtime-host readiness is emitted only after the native module body. A
red/green ordering check covers this distinction. There is
no evaluation of design content in the grant host, asynchronous picker
command queue, CSP relaxation or new authorization mechanism. A failed
preparation cannot replace an already edited document: initialization has
not started. Successful resources are reused; failed preparation can retry
through the original checked parent failure/fresh-grant flow.

Delayed preparation exposed the host download shim's assumption that native
hosts existed at DOMContentLoaded. Installation now also listens for explicit
native-runtime readiness, installs once per host and retains the original
Blob/ArrayBuffer validation and object-URL cleanup.

This boundary **does not make the four required programs optional** or split
all Design core dependencies. The main entry is 5,504,067 bytes / 1,381,265
Brotli bytes; the four programs add 158,263 Brotli bytes. Their combined
1,539,528 Brotli bytes require about 3.08 seconds of uncached transfer at
4 Mbps, before other resources or initialization. All **663** original
native initializer factories still run. Three previously deferred source
programs (capture, property scrubber, standalone export) remain at their
native asynchronous consumers. [Static candidate sizes and native exports](evidence/phase4/design-candidates.json)
are an investigation aid, not proof of safe lazy boundaries.

**Slides.** The native selection/property inspector, segmented/sides controls
and theme panel now load with the `properties` capability. Closed panels do
not fetch it. Loading/failure/retry preserves the current document and its
unconfirmed edits. Native text fill hooks and the feature-flag hook stay in
core; Node compiler behavior remains eager/synchronous. There are seven
explicit lazy capabilities and **288** eager browser initializer factories.
The inventory includes actual esbuild edges and bytes, not inferred package
sizes.

**More progressive formats.** Unrestricted writable native file decks with
installed design systems can now expose their real landing slide after the
actual declared token files are prepared. Metadata/dependencies precede the
remaining page reads. No token is synthesized and no partial deck is
published. The native full composition and per-file base/CAS still own save.
The partial model records theme/font-file hashes, faces and style. A change
in these dependencies, the first page, its existence or write permission
blocks completion and retains the local draft for recovery. The original
read-only/narrowed, external-notes and legacy fallbacks remain full-load.
Fonts still use native font readiness; awaiting token preparation is not a
claim that all font bytes have already loaded.

## Drafts and authorization

An existing writer's `__deck/session` now intersects its originally issued
write capability with **current** `artifact:write` permission. A readonly
capability never upgrades when project write permission returns. Existing
read authorization and publish permission checks are retained.

The new integration cases cover both Design and Slides: project write
permission downgrade, fresh readonly grant, rejection of old/fresh readonly
writes, writer recovery after permission returns, signed expiry, different
tenant, wrong editor kind and actual membership revocation. They assert
persisted file bodies remain unchanged after rejected operations.
[Source-head CI authorization excerpt](evidence/phase4/authorization-ci.txt)
shows both cases passed in the real artifact boundary suite, **8/8**, against
the formal dependency tree. The integration job in
[run 41684341322](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41684341322)
succeeded; that run's server job failed two outdated download mocks lacking
`window.addEventListener`. `9a1009c9` updates those mocks; the affected local
three-test download check passes. Final-head CI remains a release gate.

Stage 3 current-tab recovery, 16 MiB/frame backup, explicit fresh authorized
restore and native save acknowledgment are unchanged. It is not persistent
recovery after a forced tab close. Read denial still clears private frames
and copies; failed capture still preserves the concealed native document.

## Functional evidence

- [Design required-resource retry](evidence/phase4/design-module-startup/browser.json.gz): actual gateway/CSP/cache, first picker 503, support delayed beyond DOM readiness, no native document reads before required preparation, checked-parent retry, native guest edit/save and working late-host downloads. One successful transfer per fixed program URL; no browser errors.
- [Nested component](evidence/phase4/design-module-components/browser.json.gz): native DC import selection opens its component artboard; child edit saves with native CAS, preserves caller source and canvas order and propagates to both sandboxed instances. No interception or content execution in the host.
- [Actual WOFF2/PPTX retry](evidence/phase4/font-browser/browser.json.gz): a pinned real public DM Sans font, with its [source/hash](evidence/phase4/font/source.json) and [OFL](evidence/phase4/font/OFL.txt). Only external Google Fonts responses are fixture bytes. Decoder/editor requests use actual HTTP. No decoder request before export; first decoder 503 leaves native warning/fallback output, second export contains `ppt/fonts/font1.fntdata`. Edited text is saved and present in output; the native document is unchanged across retry.
- [Themed progressive edit](evidence/phase4/themed-progressive-browser/browser.json.gz): actual three installed native systems and eight-second delayed later pages. Landing-page edit occurs before later reads; no partial publish; other files and full order survive; final save and undo/redo pass.
- [Desktop properties](evidence/phase4/properties-desktop-final/browser.json.gz) and [768 px properties](evidence/phase4/properties-narrow-final/browser.json.gz) prove no closed-panel download, unsent native text retained across first 503/retry, property save/undo/redo and pane reopen with the same native document.
- [Final Design recovery, desktop](evidence/phase4/design-recovery-desktop-final/browser.json) and [768 px](evidence/phase4/design-recovery-narrow-final/browser.json), plus [unchanged Slides desktop](evidence/phase4/recovery-desktop/browser.json) and [768 px](evidence/phase4/recovery-narrow/browser.json), cover signed-expiry replacement, exact native save acknowledgment, downgrade to readonly download and read-revocation cleanup. The latter two reports also retain the earlier wrapper Design cases; only their Slides cases qualify the unchanged Slides source.

Design standard native editable/readonly/math-first-failure/offline-HTML/PNG
checks passed on the identical final Design entry hash. Slides standard
styled-deck checks exercise theme/property use, native Latin font selection,
original non-Latin family protection, saved style and color inheritance,
reopen without rewrites and actual HTML/PPTX/PDF output inspection. Old
checker labels/colon punctuation and ambiguous property/title locators were
corrected. The test explicitly selects the nonblank page after reload;
it does not treat thumbnail text as an editable canvas. Native CJK family
protection was reproduced with the saved baseline and preserved.

Owning checks: Slides **23/23**; Design **10** other checks plus corrected
exact-byte packaging **1/1**; download/static **3/3**; affected original/new
download checks **3/3** using the repository runner's isolated unit fixtures;
policy **13/13**; five final themed cases additionally cover changed font-file
hash, readonly and narrowed access; scoped lint exits zero. The original Design packaging
expectation first failed because it looked for new extracted resources in
the unchanged upstream archive; the updated check compares exact source
bytes and compression. Red/green logs are retained. There was no repeated
full Web/server local test campaign; formal CI owns those checks.

## Measurements and limits

Final Chromium 154.0.8037.57, HTTPS/Brotli, 1440×1000, recursive OOPIF
20 ms / 4 Mbps, CPU 1. Ten alternating pairs for each editor/scenario
(**120 actual opens**), with visible native canvas, loaded fixture image and
a trusted double-click entering contenteditable as the endpoint. There were
no concurrent builds or other browsers and no open errors. Raw [requests and
endpoint metrics](evidence/phase4/paired-final.json.gz), [resource byte/request
accounting](evidence/phase4/resources-final.json) and [assessment](evidence/phase4/assessment-final.json)
are retained. Required source-data Fetch requests count as JavaScript.

| Editor / scenario | Baseline p50 / p75 / p95 ms | Final p50 / p75 / p95 ms |
| --- | ---: | ---: |
| design / cold | 5363.4 / 5566.1 / 5583 | 4652.9 / 4657.4 / 4835 |
| design / warm-new-frame | 1059.6 / 1076.8 / 1274 | 1054.4 / 1068 / 1084.5 |
| design / switch | 1195.8 / 1203.4 / 1217.1 | 1190.6 / 1193.8 / 1204.2 |
| slides / cold | 3498.8 / 3570.7 / 3584.8 | 3280.5 / 3310.2 / 3327.8 |
| slides / warm-new-frame | 799.6 / 823.9 / 853.7 | 797.5 / 804.9 / 852.3 |
| slides / switch | 923.1 / 931.2 / 988.6 | 878.2 / 929.2 / 935.3 |

Cold p75 improves **16.3% Design / 7.3% Slides**. The fixed original goals
remain **2786.25 / 1761.6 ms** and are **not met**. `--require-target` correctly
exits **1**: staged regression gate passes, cold target fails, retained gate
passes. No prewarm or retained result substitutes for cold.

The earlier wrapper candidate and its own ten-pair data remain in
[wrapper-paired-open.json.gz](evidence/phase4/wrapper-paired-open.json.gz)
with [its provenance](evidence/phase4/wrapper-provenance.json). Its cold p75 was
4906.4 / 3304.9 ms. A two-pair [screening comparison](evidence/phase4/module-exploratory.json.gz)
favored module resumption before the final ten-pair qualification. This is
evidence for the final boundary choice, not a measured attribution to a
specific V8 compilation stage.

Forty actual retained reopens preserve iframe, WindowProxy and document
timeOrigin, obtain fresh authorization and transfer zero new scripts:

| Viewport | Design p75 ms | Slides p75 ms |
| --- | ---: | ---: |
| 1440 | 213.6 | 235.6 |
| 768 | 203.7 | 218.2 |

[Desktop retained/memory/CPU](evidence/phase4/retained-desktop-final.json) and
[768 px](evidence/phase4/retained-narrow-final.json) show exactly two retained
frames. Both-hidden process-family PSS is **586 / 544 MiB** after repeated
editing; removing frames leaves **583 / 535 MiB**; explicit host GC without
test-held references yields **363 / 355 MiB**. Hidden CPU is **0.06 / 0.08 CPU
seconds per five wall seconds**, versus **0.10 / 0.21** with Slides visible.
These are observations, not hard browser memory-byte bounds or promises of
natural reclamation. Scope/permission cleanup and the 16 MiB/frame draft copy
limit remain distinct from the two-instance bound.

Endpoint metrics retain native marks and long tasks where instrumented.
For Design the endpoint is its guest canvas, so its metric object is not a
complete attribution of the grant host’s 663 initializer costs. Comprehensive
internal Design edges and full-core CPU attribution remain open; neither
the consumer inventory nor static function sizes claims to provide them.

No credentials or registry permissions were changed to bypass local SDK
access. Local SDK remains 3.8.16 versus required 3.8.21 after the earlier
ordinary E401. Existing authorized CI installed the formal dependency tree
and ran the real authorization regressions. No local SDK-integration success
is inferred from browser fixtures.

Remaining issue gates: complete Design core/vendor/UI splitting (including
separating the `tG` canvas shell and `l9` editor-session synchronous hooks from
optional panels rather than moving their whole factories), the fixed
cold targets, any remaining progressive format coverage, final independent
review and production qualification. This contributor has not merged,
SSHed or deployed. #657 at `2a945125` remains separate and valuable; #654's
shared CLI work was not changed. The parent thread's sole integrator must
review the final head, reconcile shared CLI changes, confirm both hosts and
single-writer/in-flight state and own any production operation. Existing
public old-resource retention guards are unchanged; actual two-host rollout
and production readiness remain unverified here.


## Reproduction and remaining review

Use Node 22.23.4 and the existing authorized dependency/CI setup. Rebuild
Design and Slides, with `--metafile=<path>` for Slides, and build the actual
host with `perf/editor-open/build.mjs`. The ordinary local TLS fixture,
baseline copies and source hashes are described in [Phase 3](PHASE3.md).
Required switches for the shipped focused checks are:

```text
PERF_RECOVERY_FIXTURE=1 PERF_FAIL_DESIGN_PROGRAMS=picker PERF_DESIGN_PROGRAM_DELAY_MS=1200
  python3 perf/issue-652/design-startup.py <port> <out>
PERF_RECOVERY_FIXTURE=1 PERF_COMPONENT_FIXTURE=1
  python3 perf/issue-652/components.py <port> <out>
PERF_RECOVERY_FIXTURE=1 PERF_FAIL_FEATURES=properties
  python3 perf/issue-652/properties.py <port> <out> [768]
PERF_RECOVERY_FIXTURE=1 PERF_THEME_FIXTURE=1 PERF_LATER_SLIDES_DELAY_MS=8000
  python3 perf/issue-652/progressive.py <port> <out>
PERF_RECOVERY_FIXTURE=1 PERF_FONT_FIXTURE=1 PERF_FAIL_FEATURES=woff2-decoder
  python3 perf/issue-652/font-retry.py <port> <out> perf/issue-652/evidence/phase4/font
PERF_RECOVERY_FIXTURE=1
  python3 perf/issue-652/recovery.py <port> <out> [768]
```

Run browser qualifications sequentially. After freezing generated assets,
run `bench.py 10 <out.json.gz> baseline=<port> candidate=<port>` and
`retained.py <candidate-port> <out.json> [768]` with no concurrent builds or
other browsers. `assess.mjs <paired.json.gz> --retained=<retained.json>
--require-target` intentionally exits one while the fixed cold goals fail.
Redirect the older standard checkers' evidence destinations into scratch
paths rather than overwriting historical issue-621/648/Phase-2 files.

Independent review must inspect the final head, particularly native module
readiness, asynchronous capability retries, partial-model/dependency guards,
actual permission intersection and backup cleanup. Additional Design
property-worker first-failure permutations, deeper component/legacy formats
and complete core initialization attribution are not claimed by the focused
cases above. A single component fixture is not exhaustive subcanvas coverage.
The cold/core gates remain open even if final-head CI passes.
