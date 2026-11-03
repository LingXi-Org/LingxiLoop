# Issue #652: editor performance work in progress

The current implementation and qualification are in [PHASE2.md](PHASE2.md).
It adds lazy math/source resources and bounded cross-view retention, but **does
not complete #652**. The fixed cold-start budgets still apply.

## Archived first-stage report (`b7c9f54a`)

This first stage removes a confirmed optional-warm-up barrier and establishes a
reproducible baseline. It **does not complete #652**, split either editor's
functional modules, or enable extra retained instances. Cold-start targets and
retained-instance targets remain unmet/unqualified. Do not close the issue from
this PR or treat warm-up results as cold-start improvement.

Baseline source is `9194a436` (merged #651, baoyu-design v2.8.0). Current main
`5e3fb788` includes that commit; its only additional changes are the #656 image
packaging repair. The baseline host was built before this implementation and its
Design/Slides generated assets were copied unchanged. Both benchmark servers use
those same editor bytes; the candidate host only removes waiting for warm-up.
No archived upstream file, Chinese copy, theme, formula renderer, font URL,
authorization, document format, CSP or sandbox is changed.

## Measurement contract and budgets

Chromium on this managed Linux host, 1440×1000, CPU 1×, 20 ms latency,
4 Mbps download / 3 Mbps upload, recursive CDP throttling for child targets.
HTTPS uses a temporary local certificate and browser trust pinned to its public
key; product trust is untouched. The original HTTP fixture negotiated gzip, so
that diagnostic run was excluded. The recorded HTTPS requests negotiate Brotli.
Grants and documents are synthetic; the actual editor, host frame, isolated
gateway and CSP run. This excludes production login, ACL/database, IM/model,
CDN latency and the user's private artwork.

Readiness requires visible authored content and a trusted double-click entering
contenteditable; Slides additionally requires the fixture image to be loaded.
Skeleton removal, iframe load and initialization marks alone do not qualify.
Every new cold context starts with an empty HTTP cache. `warm-new-frame` destroys
and recreates the frame with cached assets; `switch` opens another synthetic
artifact. Neither is a retained-instance reopen. The fixture does not exercise
the product's workspace retention owner.

The pre-implementation 10-run baseline (nearest-rank p50/p75/p95, ms):

| Kind | Cold | Warm new frame | Another artifact |
| --- | --- | --- | --- |
| Design | 5559.3 / 5572.5 / 5664.3 | 1063.0 / 1078.2 / 1296.5 | 1190.6 / 1204.9 / 1222.5 |
| Slides | 3477.4 / 3523.2 / 3596.9 | 808.9 / 856.6 / 870.7 | 914.9 / 942.8 / 953.5 |

The numerical cold p75 budgets fixed from that baseline are **2786.25 ms Design**
and **1761.6 ms Slides**, with a separate 300 ms retained-reopen goal. See
`budgets.json`. The first stage's limited gate allows at most 10% cold p75
regression; `assess.mjs --require-target` additionally requires both full-issue
timing goals and deliberately fails while retained evidence is missing. Timing
goals alone never establish the rest of the issue's functional acceptance.

## Confirmed opening barrier

`ArtifactEditorFrame` previously waited for `Promise.all(grant, editorWarming)`;
the latter joined the complete preload list, including fonts not necessarily
used by this view, for up to 15 seconds. The existing browser visibility check
now holds an optional warm-up response open. Before implementation it failed
with `iframe mount during warm-up timed out`, with zero child contexts. The
candidate mounts after authorization while that response remains pending, and
still rejects wrong source/nonce/schema, preserves the opaque fallback sandbox,
times out a missing application handshake, and requests a fresh retry grant.
The speculative fetches still coalesce with each other; four preload/grant
unit checks pass. This does not assert browser in-flight cache coalescing: the
paired request traces must be checked for actual repeated transfer.

## Reproduce

Use the same installed dependencies for both arms. This checkout's installed
LingxiOS is 3.8.16 although HEAD requires the formally published 3.8.21. No SDK
integration qualification is inferred from these editor fixtures. A normal
registry metadata read for 3.8.21 returned E401; no credentials were changed.

Build/copy baseline generated editors and host before applying the product
change (keep both baseline editors under `.codex-tmp/issue-652/baseline/`).
Build the candidate host with the same fixture:

```sh
node scripts/build-design-editor.mjs
node scripts/build-slides-editor.mjs --metafile=.codex-tmp/issue-652/slides-metafile.json
node perf/editor-open/build.mjs . .codex-tmp/issue-652/host-candidate
mkdir -p .codex-tmp/issue-652/tls
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -keyout .codex-tmp/issue-652/tls/key.pem -out .codex-tmp/issue-652/tls/cert.pem -subj '/CN=*.lingxi-perf.cn' -addext 'subjectAltName=DNS:*.lingxi-perf.cn'
```

In separate shells, set `PERF_TLS=1`, `PERF_TLS_KEY` and `PERF_TLS_CERT` to those
test paths, `PERF_DESIGN_DIST` / `PERF_SLIDES_DIST` to the saved baseline editor
directories, then run `node --import tsx perf/editor-open/serve.ts . <host> <port>`
with baseline host/4411 and candidate host/4412. HTTPS uses a loopback-only HTTP
upstream on port+100 for the actual gateway. All static code paths are unchanged.

```sh
python perf/issue-652/bench.py 10 perf/issue-652/evidence/paired-open.json.gz baseline=4411 candidate=4412
python perf/issue-652/bench.py 10 perf/issue-652/evidence/paired-prewarm.json.gz baseline=4411 candidate=4412 --warm=true
python perf/issue-652/bench.py 1 perf/issue-652/evidence/narrow.json.gz baseline=4411 candidate=4412 --width=768
node perf/issue-652/assess.mjs perf/issue-652/evidence/paired-open.json.gz
node perf/issue-652/inventory.mjs .codex-tmp/issue-652/slides-metafile.json perf/issue-652/evidence/inventory.json.gz
```

Run timing pairs without concurrent builds or other benchmarks. Raw samples and
sanitized network requests are losslessly compressed JSON; resource byte counts
include HTTPS requests unfinished at click plus those started during opening,
measured at the editable endpoint (not a complete post-open idle trace). The
browser heap field is not total iframe/native memory, and long-task observations
are not a complete cross-frame main-thread profile.

## Remaining implementation and acceptance

- Design: split child/support/preview/capture sources by real consumer, change
  synchronous source-string contracts, defer online math and fonts while
  assembling self-contained offline output at export. Keep Blob/external/inline
  recovery and subcanvas behavior; source-string consumers must remain tracked.
- Slides: defer presentation/speaker/template/property capabilities and their
  transitive dependencies, preserving cyclic install order and the Node compiler;
  progressively prepare non-visible slides and defer math without changing HTML.
- Retention: keep a real initialized Design and Slides instance across app views,
  measure memory before selecting a count/eviction budget, pause hidden work,
  and verify scope/access/expiry/delete cleanup. Existing sidebar/library-local
  retention does not prove this application-level requirement.
- Measure first use and retry for every split feature, edit/save/refresh recovery,
  undo/redo, formulas/images/presentation/all exports/subcanvas, desktop/narrow
  visual behavior, focus/keyboard/motion, and real authorization boundaries.
- Complete final-candidate independent review, formal-dependency CI and the
  parent's sole-integrator release gates. #656's image success alone is not
  evidence that #648 or this change deployed.

## Recorded candidate results

Ten alternating AB/BA pairs per kind/scenario (120 editable opens), then ten
alternating pairs during warm-up (40 opens), plus 12 narrow functional opens.
No page errors. Complete p50/p75/p95 and bytes are in the two `*-summary.json`
files; raw network/mark/heap observations remain in the matching `.json.gz`.

| p75, ms | Baseline | Candidate |
| --- | ---: | ---: |
| Design cold | 5567.9 | 5549.9 |
| Slides cold | 3546.5 | 3534.5 |
| Design during warm-up | 3847.5 | 3743.3 |
| Slides during warm-up | 1866.3 | 1744.8 |

The warm-up improvements in this profile are 2.7% and 6.5%. Cold behavior is
effectively unchanged; the full-issue target gate correctly exits 1. No same-JS
URL had two responses each transferring >1 KB in any recorded open, including
warm-ups already in flight at click. This is observed Chromium behavior in this
fixture, not a browser-wide guarantee. Warm-new-frame Slides p75 increased
817.9→857.8 ms; it is recorded, not called an improvement.

Median cold HTTPS bytes at editable readiness were 2,014,052→2,014,053 for
Design and 1,183,299→1,183,299 for Slides, including headers/document requests.
Build hashes and compressed byte counts of every generated editor file match
the saved baseline exactly. Design's entry alone is 7,324,147 decoded /
1,904,981 Brotli bytes. Slides' initial JS is 3,952,808 decoded bytes. The actual
Slides browser metafile has 326 inputs / 7 outputs, and this v2.8 runtime installs
292 initializers. `inventory.json.gz` records those graph edges and Design's large
source-string bindings/consumer offsets. Design still has one monolithic entry;
its inventory is explicitly not a complete internal function graph.

Desktop and 768px screenshots show the real selected, editable heading and (for
Slides) the loaded image. Narrow samples are functional evidence (one per arm),
not narrow timing percentiles. No new retained-instance memory, background
cost, first-use export/capture retry, Firefox or Safari qualification is claimed.

Completed checks on the frozen candidate code:

- Node 22.23.4: 31 editor/math/build/archival/compiler tests; all 542 original
  baoyu-design files retain their pinned hashes, and compressed sidecars roundtrip.
- Node 22.23.4: 11 focused preload, reveal, Design open/scope and static-asset tests.
- Existing actual browser visibility check passes the newly reproduced stalled
  warm-up regression plus source/nonce/schema, opaque sandbox and retry checks.
- Existing Slides retention browser check passes same-frame library reopen,
  reauthorization before visibility, revocation cleanup, one retained deck and
  project cleanup. It does not prove cross-view retention.
- Local Web typecheck and scoped Biome lint pass; diff whitespace check passes.
- The optional metafile build runs and the resulting inventory parses. Editor
  output hashes/bytes equal the baseline despite this extra diagnostics output.
- The staged timing gate passes; full issue timing/retention gate fails as
  expected. Independent review and formally installed final-head CI remain gates.

Delivery status: no merge or deployment by this contributor. #655's fix is
already in #656; the separate #657 now contains only the incremental transitive
build-input test, with final-head CI 41626390244 green. Main run 41625513044
built the server image, but its prefetch was cancelled at 11:30:39 UTC and deploy
was skipped. Production version and single-writer handoff remain unverified.
