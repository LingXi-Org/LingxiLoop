# #660 follow-up: native persistence, real editors, and style invalidation

Historical measurements on the pre-integration #662 candidate. See
[INTEGRATION.md](./INTEGRATION.md) for the minimal #664 conflict resolution and
release handoff. The user has since authorized merging and production release;
#660 stays open: cold loading has not met its
50% goal, and the measurements do not establish every production/stall-free gate.
Production remains exclusively with the parent's designated integrator.

## Ownership and native APIs

At resume, #658 was merged at `584e1141`; #661 only touched Docker context/build
checks, and no other open PR owned these UI files. The branch merged #658 without
conflict. The follow-up edits DesktopApp only after that integration was complete.
No release, dependency, credential or product security setting is changed.

DesktopApp's old selector `[data-panel="conversations"]` matches no installed
4.12.3 Panel: its runtime emits `data-panel="true"` and `id="conversations"`.
The focused real-library control fails with **zero writes** on release. The
production `useSidebarWidth` owner now uses the native `usePanelRef/getSize`
API. Its public `inPixels` getter reads the DOM, and the library emits keyboard
layout commits before that DOM update; a synchronous first attempt preserved
stale keyboard width. The final owner samples once in the next animation frame,
cancels pending work on unmount and only saves user-originated commits. Bounds,
300px default, existing key and denied-storage behavior remain intact.

The actual shared Resizable Group/Panel/Separator remains the split owner. No
new drag framework, animation owner or parallel open state was introduced. The
existing Sidebar/Sheet/Provider and offcanvas transition remain in place; their
pre-existing custom width handle is **not a complete migration to native
Resizable for the offcanvas boundary**. Native Group requires Panel DOM roots as
direct children, while Sidebar owns a gap plus an absolute container and retained
mobile portal. Replacing names or adding a second animation would not satisfy
#628/#660. That composition requirement remains explicit; it is not marked done
by the native persistence API fix.

## Actual workspace loading baseline

The new host renders actual DesignWorkspace, SlidesWorkspace, SlidesSidebarLayout,
ArtifactEditorFrame, pinned native editors and the existing isolated-editor
server/gateway/CSP. Documents, grants and API/IM replies are public synthetic data;
there is no production login, real IM socket or model call. Slides includes 20
image-bearing pages; the host conversation/list contains 200 entries. This does
not qualify arbitrary artwork, physical touch or server tenancy ACLs.

The first request-routed pilot was discarded: Playwright routing disables HTTP
caching. The final host serves synthetic API replies through an optional local
server flag, with **no browser routing**. Cache events in the raw CDP records
confirm real warm hits. A test-only certificate is pinned in this ephemeral test
browser; no product trust store or browser configuration is changed.

Conditions: Chromium 154.0.8037.57, Linux x86_64, 1440×1000, CPU 1×, 20ms / 4Mbps
applied recursively by the reused CDP harness. Each arm/kind has ten fresh
contexts, AB/BA alternation, and cold/retained/new-scope/refresh opens. Actual
trusted double-click must enter native editable text; Slides also requires its
real rendered image. Loading placeholders never qualify. Retained opens assert
the same iframe object **and** native document time origin. There are 160 opens
and zero page errors. Percentiles use nearest rank; fixture-shell load/login is
excluded from click-to-operable time. This profile does not establish an aggregate
browser-wide network cap across every independent CDP target.

This initial load candidate includes the persistence fix and Phase 1 drag logic,
before the later pointer-only CSS variable localization. Its figures are retained
as that stage's observations, not relabelled as final-head cold qualification.

| Kind/path | Control p50 / p75 / p95 ms | Intermediate candidate p50 / p75 / p95 ms |
| --- | --- | --- |
| design/cold | 4898.2 / 4936.7 / 5142.8 | 4919.4 / 4997.7 / 5164.6 |
| design/retained | 189.4 / 216.1 / 278.2 | 192.6 / 201.7 / 373.2 |
| design/warm-scope | 1104.6 / 1137.9 / 1329.3 | 1107.5 / 1117.1 / 1472.3 |
| design/refresh | 1389.7 / 1499.0 / 2163.1 | 1452.2 / 1561.9 / 2300.3 |
| slides/cold | 4626.3 / 4699.9 / 6315.0 | 4681.2 / 4749.3 / 5360.8 |
| slides/retained | 308.8 / 340.4 / 526.1 | 281.4 / 339.8 / 388.9 |
| slides/warm-scope | 1016.6 / 1053.7 / 1801.3 | 989.6 / 1052.1 / 1208.5 |
| slides/refresh | 1285.9 / 1401.9 / 2531.7 | 1327.6 / 1438.6 / 1481.7 |

Cold transfer medians are about 1.60MB Design and 1.68MB Slides. Design's mandatory
native core alone is 1,328,231 Brotli bytes: at the configured 500,000 bytes/s,
its transfer floor is 2656ms, above half of this control's 4936.7ms p75 (2468ms),
before other resources/init. A 50% cold goal requires reducing/defering genuinely
nonessential core work/bytes through the #652 owner; retained reopen cannot be
substituted. Warm-new-scope still spends about one second entering a fresh editor.
The paired load records include Resource Timing, CDP cache/transfer data, native
marks and frame long tasks to keep transfer and initialization distinguishable.

## Investigating the 122ms observation

The Phase 1 122ms observer entry occurred in trial 9, but that experiment saved
only trial 0's trace. Its exact cause cannot be recovered retrospectively.
`profile-drag.py` therefore captures every diagnostic trial's full renderer trace,
CPU profile and long-animation-frame scripts, with and without per-frame geometry
sampling. Profiling overhead is present, so these are **diagnostic**, not timing
acceptance. `profile-summary.mjs` maps CPU nodes to original sources and recognizes
Chromium's `ThreadControllerImpl::RunTask` event name.

Twenty control diagnostic gestures reproduce renderer tasks up to ~95ms. A
frames-only run includes a ~93ms task with ~82ms UpdateLayoutTree over 940 elements;
there is no geometry-reading sampler in that arm. The worst geometry-reading
span spends ~61ms in UpdateLayoutTree and ~7ms in layout. The selected long spans
show no GC duration in the recorded GC categories. These identify a style/layout
cost in reproduced samples; they do not prove the untraced original 122ms event
had exactly the same cause or that GC is absent globally.

Phase 1's width variable was written on the full SidebarProvider wrapper, so it
changed inherited style throughout the conversation. The final candidate writes
it only on that Sidebar's own root: gap/container still share the native width,
while unrelated conversation descendants no longer inherit every pointer update.
Release/cancel/unmount remove the temporary override and restore the controlled
provider value. The new inheritance regression fails on the Phase 1 control and
passes on the candidate, including immediate touch release and keyboard cleanup.
Both compared arms already commit width once per gesture; callback-count reduction
alone therefore cannot explain this follow-up's style-cost difference.

## Reproduction

See the source header commands in `workspace/browser.py`, `workspace/interactions.py`,
`workspace/persistence.py`, `profile-drag.py` and `profile-summary.mjs`. Build the
workspace host with `workspace/build.mjs`; its frozen control uses archived main
`584e1141` source and a verbatim-behavior legacy Desktop width owner. Link that
archive's unchanged `third_party` to the checkout and keep the fixture worker
format `es`, matching the product Vite worker configuration. Editor assets are
rebuilt from the merged source with the existing Design/Slides build commands.

The local HTTPS servers reuse `perf/editor-open/serve.ts` with PERF_TLS=1,
PERF_RECOVERY_FIXTURE=1, PERF_WORKSPACE_FIXTURE=1 and explicit ephemeral key/cert
paths. It listens on 4473/4474 with a loopback upstream on 4573/4574; never point
this fixture at production. The HTTP-only native persistence fixture uses 4475.
Run measured workloads alone, without concurrent builds/tests or another browser.
Grant/document reset tests must run **after** load measurement because they revoke
that synthetic server's existing grants.

## Functional boundaries and remaining gates

Real Design and Slides regressions drag across their iframe, preserve native
document time origin and edited text while actual CAS publish is refused, use
keyboard resizing, retain the same frame on reopen, and check narrow layout.
Synthetic read revocation reauthorizes the retained view and hides the old frame;
this tests the existing host behavior, not real database/tenant authorization.

Native persistence regression verifies zero writes during movement, one after
release, restored width after refresh, keyboard persistence, no resize/init writes,
and resilience to malformed/denied storage. Original desktop DOM selector failure
and the post-localization inheritance failure are saved separately.

Final independent review, current PR CI, production login/IM/Agent streaming,
physical-device input, complete offcanvas Resizable composition and the cold-start
goal remain separate gates. No claim of full #660 acceptance or deployment is made.

## Final pointer-only candidate measurements

The final scoped-variable candidate was rebuilt and compared with the Phase 1
wrapper-variable control: ten AB/BA trials per arm for right, left, native and
stream-counter drags (80 gestures). The shared fixture's native control retains
its deliberately frozen legacy width callback; its zero writes are **not** the
new production persistence result. That result is verified separately through
the actual production hook and native Group in `persistence.json`.

| Case | Median style ms: control → final | Median task ms: control → final | Pooled frame p95 ms: control → final |
| --- | --- | --- | --- |
| right | 736.62 → 93.91 | 1962.91 → 1262.43 | 16.8 → 16.7 |
| left | 1268.51 → 393.24 | 2846.66 → 1856.87 | 16.8 → 16.8 |
| native | 97.92 → 94.72 | 1771.38 → 1728.59 | 16.8 → 16.7 |
| right-stream | 728.01 → 108.93 | 2229.04 → 1534.17 | 16.8 → 16.7 |

Right style cost falls about 87%, left about 69%, and the stream-counter case
about 85%. Normal right/left gestures still have two React profiling commits and
one owner callback in both arms. Streaming commit totals vary with gesture wall
time and counter ticks; they are not presented as an independent optimization.
Layout cost remains broadly similar; the measured change chiefly removes style
invalidation. The candidate records two >50ms observer tasks (54/79ms), no such
task in ten stream-counter gestures, and **one >100ms frame interval in the left
case**. The control records nine observer tasks and one >100ms interval. These
are local shared-component samples, not proof of universally stall-free real
editors. Every candidate per-gesture frame p95 is ≤16.8ms, but rare-tail and real
production stress requirements remain open.

Six additional profiled candidate diagnostics (three per sampler mode) record
no >50ms renderer task; their UpdateLayoutTree element-count p95 is 24, versus
940 in the earlier 20 control diagnostics. These differently sized diagnostic
cohorts corroborate the style-inheritance mechanism; they are not a statistical
long-task-rate acceptance comparison. Mapped summaries preserve every diagnostic
run. Raw trace/profile pairs preserve the worst control per mode, the observed
93ms style case, and one candidate trace per mode.

## Cold recheck on final executable source

After the pointer-only localization, the actual workspace candidate was rebuilt
again and cold opens rerun with ten AB/BA trials per arm per kind (40 further
opens). This final executable source has no editor-core byte/initialization
change. All 40 opens entered real native editing without page errors.

| Kind | Control p50 / p75 / p95 ms | Final candidate p50 / p75 / p95 ms |
| --- | --- | --- |
| design | 4812.7 / 4945.8 / 5405.0 | 4884.9 / 4971.8 / 5201.4 |
| slides | 4626.2 / 4689.3 / 4703.3 | 4739.3 / 4803.3 / 5304.7 |

There is no demonstrated cold-start improvement and the 50% goal fails. The
separate retained/warm/refresh baseline above must not be substituted for it.
The final-stage source and build hashes are recorded in `evidence/phase2/provenance.json`.
Latest main `abf69c48` adds only #661 Docker/build checks; `src/` and `perf/`
are unchanged relative to the measured integrated-main control.

## Executed commands and artifacts

Build commands used the archived `584e1141` control and current checkout:

```sh
npm run build:design-editor
npm run build:slides-editor
node perf/issue-660/workspace/build.mjs .codex-tmp/660-main-src /tmp/660-workspace-baseline
node perf/issue-660/workspace/build.mjs . /tmp/660-workspace-final-candidate
# Existing local HTTPS fixture servers on 4473/4474 use the explicit flags above.
python perf/issue-660/workspace/browser.py 10 /tmp/660-workspace-unrouted control=4473 candidate=4474
python perf/issue-660/workspace/browser.py 10 /tmp/660-final-cold control=4473 candidate=4474 --scenarios=cold
# Run functional tests after measurements; the permission test resets fixture data.
python perf/issue-660/workspace/interactions.py 4474 /tmp/660-final-interactions
python perf/issue-660/workspace/persistence.py 4475 /tmp/660-final-persistence
# Frozen Phase 1 profiling build on 4482, scoped candidate build on 4483.
PERF_PROFILE=1 node perf/issue-660/build.mjs . /tmp/660-profile-local
PLAYWRIGHT_BROWSERS_PATH=/tmp/660-playwright python perf/issue-660/drag.py /tmp/660-local-paired 10 control=4482 candidate=4483
python perf/issue-660/profile-drag.py 4482 10 /tmp/660-profile-data
python perf/issue-660/profile-drag.py 4483 3 /tmp/660-profile-local-data
node perf/issue-660/profile-summary.mjs /tmp/660-profile-build /tmp/660-profile-data
node perf/issue-660/profile-summary.mjs /tmp/660-profile-local /tmp/660-profile-local-data
python perf/issue-660/regression.py 4483 /tmp/660-local-after
npm run lint
npm run typecheck
CI_TEST_FILES='["src/desktop/useSidebarWidth.test.tsx","src/features/design/DesignWorkspace.test.tsx"]' npm test
npm run build
```

The original inheritance and persistence controls fail their targeted browser
regressions; final controls pass. `evidence/phase2/` contains raw redacted loading
rows, final-cold rows, paired drag rows, summaries, eight drag traces/WebMs,
functional screenshots and diagnostic trace/profile pairs. Test grants/origins
and blob UUIDs are redacted in real-editor JSON; no private production content,
credentials, certificates or model responses are included.

Final local lint/typecheck and all 175 Web/owning tests pass. Existing lint emits
46 warnings plus informational diagnostics. Production Web build also passed. Final PR CI and independent review remain
separate handoff gates.
