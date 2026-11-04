# #652: deferred resources and retained native editors

This continues draft PR #658. Product code is `00532a79`; measured editor/frame
code is `3ceb8dff`. The later shell-only fallback correction is outside the
editor-open fixture and has separate DesktopApp regressions.
[Build/evidence hashes](evidence/phase2/provenance.json) and
[check results](evidence/phase2/checks.json) record the scope. It **does not close #652**. The original cold
budgets are unchanged: Design p75 ≤2786.25 ms, Slides ≤1761.6 ms; retained
reopen ≤300 ms. Cold startup still misses the target. The remaining work below
is required before treating the full issue as complete.

## Implemented behavior

Design keeps its pinned upstream archive unchanged and extracts three exact
source strings at their existing asynchronous consumers: SVG capture (250336
bytes), property introspection (36043 bytes), and standalone export bootstrap
(19928 bytes). Requests coalesce within one editor, use anonymous CORS plus
SHA-256 integrity, and clear failed attempts for retry. Property introspection
failure returns no inferred props without caching that failed result; selecting
again retries. It has no new visible failure UI.

Online Design previews initially carry a 3584-byte delimiter observer. The
first formula loads the 297110-byte renderer and only fonts used by that
formula. Failed loading preserves raw source and offers “重试公式”. Capture
waits for rendering/fonts. Standalone HTML instead assembles the original
641962-byte full renderer with embedded fonts and an offline flag, before
preview code executes. Opening the recorded synthetic HTML makes zero external
requests. The unchanged document format remains raw authored source.

Slides uses the same small delimiter selection and source-run rules before
loading KaTeX. One renderer and one pending import are shared by canvas and
thumbnails; a successful retry updates all readers without replacing the
editor. Plain exports do not force the renderer. The Node compiler registers
the renderer eagerly and retains its synchronous contract. Math CSS/fonts are
outside the ordinary first view. Existing export/PPTX/font-decoder lazy paths
remain lazy. Four bounded feature preparations populate the immutable HTTP
cache before native dynamic import: a 503 during preparation therefore does
not poison the browser module map. Failed preparations reset. This does not
solve missing old hashed chunks after a release.

The app retains its visited conversation/Design subtree and Slides subtree in
fixed slots, scoped by account, company and project. There is at most **one
native Design and one native Slides editor**. Opening another artifact of the
same kind replaces the old one; account/project/logout/navigation teardown
releases the scope. Native frame DOM nodes are not reparented. Inactive slots
keep their dimensions, are invisible, inert and absent from the accessibility
tree. Hidden mobile drawers close. Slides context heartbeat and CSS animations
pause while hidden; this is not a promise to suspend every upstream timer.

Returning checks current server authorization before revealing content. A
still-valid original grant can retain its frame only with the same artifact,
kind and write mode. Reauthorization does not extend that original grant.
Transient access-check failure conceals and preserves the draft for retry;
explicit 401/403/404/410 and deletion discard private content. Original expiry
is checked on reveal rather than destroying a potentially unconfirmed draft
on a background timer. Expired reopen obtains a new grant/frame; migration of
unconfirmed local changes across that replacement remains unqualified.

## Generated dependency evidence

| Generated JavaScript | Baseline | Candidate |
| --- | ---: | ---: |
| Design entry decoded | 7324147 | 6363985 |
| Design entry Brotli | 1904981 | 1526768 |
| Slides eager graph decoded | 3952808 | 3687240 |
| Slides eager graph gzip | 1269026 | 1193066 |

These are generated resource bytes, not time-to-edit reductions. The complete
consumer/build inventory is [inventory.json.gz](evidence/phase2/inventory.json.gz).
Slides has 329 build inputs and 9 outputs; **292 runtime initializers remain**.
The main Design runtime/support and Slides UI/compiler are still large.

## Measurement and limits

The baseline host and generated editors were saved from `b7c9f54a` before this
continuation. The inherited original budget baseline is `9194a436`. Chromium
154.0.8037.57 on Linux, 1440×1000, CPU 1×, HTTPS/Brotli, recursive CDP throttling,
20 ms latency and 4 Mbps download. Each arm uses the same installed dependency
tree. Empty browser contexts define cold; cached new frames and different
artifacts are reported separately. Actual authored canvas plus a trusted
double-click entering editing is required; Slides also requires its image.
Grants/documents are synthetic. Production login, ACL/database, IM/model, CDN
latency and the full app's memory are excluded.

Each cell is nearest-rank p50 / p75 / p95 (ms), ten samples per arm/kind/scenario.

| Editor / scenario | Baseline | Candidate |
| --- | ---: | ---: |
| design / cold | 5561.6 / 5599.2 / 5608.9 | 4668.4 / 4682.1 / 4687 |
| design / warm-new-frame | 1064.7 / 1078.5 / 1270.1 | 1058.4 / 1062.1 / 1082.7 |
| design / switch | 1193.6 / 1205.1 / 1216.2 | 1196.1 / 1201 / 1202.4 |
| slides / cold | 3553.3 / 3560.1 / 3582.1 | 3373.7 / 3397.7 / 3424.6 |
| slides / warm-new-frame | 810.5 / 858.6 / 920 | 818.7 / 836.3 / 898.3 |
| slides / switch | 925.3 / 936.7 / 970.6 | 931.8 / 936.5 / 949.8 |

Cold p75 improved 16.4% / 4.6% against the paired baseline; it did not
reach the original 50% budgets. The limited ≤10% cold-regression gate passes;
the full timing gate **fails** on cold startup.

[All timings and bytes](evidence/phase2/summary.json),
[120 raw opens/requests](evidence/phase2/paired-open.json.gz).

| Retained reopen | Design p50 / p75 / p95 | Slides p50 / p75 / p95 |
| --- | ---: | ---: |
| 1440px | 171.3 / 192.3 / 200.5 | 212.5 / 226.5 / 245.4 |
| 768px | 191.9 / 215.1 / 219.0 | 205.0 / 228.5 / 249.6 |

All 40 retained reopens preserved the iframe, WindowProxy and child document
time origin, fetched a fresh authorization check, and transferred no new script.
Both widths meet the 300 ms retained goal.
[Desktop raw memory/requests](evidence/phase2/retained-desktop.json),
[768px raw memory/requests](evidence/phase2/retained-narrow.json).

| Chromium process-family PSS (MiB) | 1440px | 768px |
| --- | ---: | ---: |
| host only | 286.49 | 282.55 |
| initialized design | 390.32 | 380.06 |
| initialized slides | 467.72 | 453.16 |
| both hidden end | 602.81 | 592.57 |
| Slides visible end | 601.23 | 595.21 |
| after releasing both frames | 598.79 | 589.26 |
| after host GC without test references | 363.11 | 355.31 |

Over five seconds with the same process set, both-hidden CPU was 0.04 s
(1440px) / 0.05 s (768px), versus Slides-visible 0.11 s / 0.10 s. Memory
grew during repeated editing; DOM removal alone did not immediately reclaim it.
The explicit GC diagnostic recovered much of the retained allocation. These
measurements support a two-instance count bound, not a hard memory cap.

Retention measures actual initialized native editors through the real frame,
isolated gateway and CSP. App ownership is checked separately against the
actual DesktopApp with unrelated UI/IM mocked. Same iframe/WindowProxy **and
child performance.timeOrigin**, fresh grant requests, and zero new script
transfers are required. A 768px run checks the same lifecycle and viewport.

Memory is Linux proportional set size (PSS) summed for the dedicated Chromium
process family, including native/browser allocations. It is neither JS heap
nor a browser-enforced byte budget. CPU is process user+system time over a
five-second interval; natural reclamation may lag DOM removal. Explicit host
GC is a separate diagnostic after dropping the test's iframe references.
The count limit is two; no extra LRU, hard-byte cap or idle TTL is asserted.

## Functional validation

- Web suite 151/151; focused grant/lifecycle/static asset/workspace/surface
  suite 17/17; editor/math/compiler/archive plus Docker/deploy contract suites
  60/60, using Node 22.23.4. The unchanged #657 transitive-build contract
  was also run against this checkout: 25/25. Scoped lint, both web TypeScript configs, standard
  `npm run build`, and final direct Vite/fixture builds passed.
- Actual Design browser: edit/save, read-only, first-view math deferral,
  deliberate first math 503 plus retry, formula capture, offline HTML with
  zero external requests. [Retry](evidence/phase2/design-math-retry.png),
  [capture](evidence/phase2/design-capture.png),
  [complete standalone HTML](evidence/phase2/design-offline.html.gz).
- Actual Slides browser: formula source edit/save/reopen, read-only preview,
  one retry recovering all formulas, presentation/fullscreen, offline HTML,
  PPTX picture/notes, rasterized PDF. [Browser result](evidence/phase2/slides-browser.json),
  [editor](evidence/phase2/slides-editor.png),
  [source editing](evidence/phase2/slides-editing-source.png),
  [presentation](evidence/phase2/slides-presentation.png),
  [PDF page](evidence/phase2/slides-pdf-page1.png),
  [complete standalone HTML](evidence/phase2/slides-offline.html.gz).
  That routed fixture disables HTTP cache and is not duplicate-transfer evidence.
- Separate HTTPS/gateway/CSP first-use fixture, without request interception:
  deliberate math, export and PPTX-library 503s recover in the same native
  iframe/document; third export attempt downloads a valid PPTX. Every JS URL
  has one successful >1 KB transfer. [Full requests](evidence/phase2/first-use.json.gz).
  WOFF2 failure is checked by the shared preparation regression; a real
  embedded-font export failure remains unqualified.
- Native frame checks: stalled optional warm-up cannot block mount; trusted
  source/nonce/schema; opaque fallback sandbox; missing-handshake timeout and
  fresh-grant retry; retained reauthorization; 503 preservation/retry; 403 and
  deletion teardown. Library reopen and desktop/mobile view ownership pass,
  including visible navigation placeholders and empty-workspace content.

Local installed LingxiOS remains 3.8.16, while the repository requires 3.8.21.
A normal metadata read for 3.8.21 returned E401. No credentials, registry
permissions or security settings were changed. These local editor checks do
not qualify formal SDK integration; final-head existing CI must do that.

## Reproduction

Use Node 22 and the unchanged lockfile. Prepare the saved baseline and local
TLS fixture as in the archived README, then build the candidate:

```sh
node scripts/build-design-editor.mjs
node scripts/build-slides-editor.mjs --metafile=.codex-tmp/issue-652/phase2-slides-metafile.json
node perf/editor-open/build.mjs . .codex-tmp/issue-652/host-candidate
node scripts/check-slides-editor-visibility.mjs
node scripts/check-slides-retention.mjs
node scripts/check-artifact-view-retention.mjs
node scripts/check-artifact-view-retention.mjs --mobile
python scripts/check-design-editor.py
python scripts/check-slides-math.py --math-retry --evidence-dir=.codex-tmp/issue-652/slides-math-final
```

The Design checker updates its historical screenshot path; keep this run's
evidence separate and restore historical evidence before committing. Serve
baseline/4411 and candidate/4412 with the same TLS/proxy fixture described in
the README. Run measurements sequentially without builds or other benchmarks:

```sh
python perf/issue-652/bench.py 10 perf/issue-652/evidence/phase2/paired-open.json.gz baseline=4411 candidate=4412
python perf/issue-652/retained.py 4412 perf/issue-652/evidence/phase2/retained-desktop.json
python perf/issue-652/retained.py 4412 perf/issue-652/evidence/phase2/retained-narrow.json 768
node perf/issue-652/assess.mjs perf/issue-652/evidence/phase2/paired-open.json.gz --retained=perf/issue-652/evidence/phase2/retained-desktop.json --require-target
```

The final command must fail while cold budgets are missed, even when retention
passes. For first-use failure testing, use a **fresh** candidate fixture port
with `PERF_MATH_FIXTURE=1 PERF_FAIL_FEATURES=math,exports,pptx-library`, then
`python perf/issue-652/first-use.py <port> <output.json.gz>`; failures fire once
per fixture process. Do not reuse that process for cold measurements.

## Remaining #652 gates

1. Comprehensive functional splitting: Design core/support/picker and remaining
   synchronous source consumers; Slides presentation/speaker/templates/property
   paths and their transitive initialization dependencies.
2. Progressively editable first slide while preparing non-visible slides,
   preserving document order, serialization, edit/save and concurrency behavior.
3. Original cold p75 budgets; rerun paired measurements after every owning change.
4. Complete subcanvas, undo/redo, embedded-font/export and source-recovery
   permutations. Preserve unconfirmed drafts across grant expiry and write-mode
   downgrade; current expiry replacement is not a recovery qualification.
5. Real production ACL/expiry validation. Existing frame tests use synthetic
   grants; server authorization/sandbox/CSP have not been relaxed.
6. Cross-release resource retention: `/artifact-editor/{design,slides}-assets`
   currently proxies to the backend's current image. Existing retained static
   fallback covers `/assets`, so old editor hashes can still 404 after rollout.
   HTTP-cache preparation handles transient failures, not missing releases.
   Coordinate the owning deployment/static-resource change; do not weaken CSP
   or invent credential access to paper over it.
7. Independent final-candidate review, exact published-SDK CI and sole-integrator
   release checks. Keep #657's separate transitive-build contract test; this
   continuation does not duplicate or supersede it. No merge/deploy is performed
   by this contributor.
