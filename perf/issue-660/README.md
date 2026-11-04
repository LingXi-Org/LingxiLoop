# #660: shared Sidebar drag candidate (partial)

This branch addresses the measured drag hot path only. Keep #660 open and this
PR draft until the workspace/loading/native-Resizable gates below are completed.
No production merge or deployment is performed by this contributor.

## Ownership and scope

On 2026-11-04, issue #660 had no assignee, no implementation comment, no matching
branch and no matching open PR. The open-PR search found #658, #657 and #635.
#628 is closed; #611 and #612 remain open even though their earlier implementation
and local evidence exist. The #660 mail receipt is dispatch evidence, not a
second implementation.

Base: `afe539b9175e924a1ba95490bb838b99d68feb58`. PR #658 at
`2a3ce67e5cb23080f88c7d6920dad7caf6397872` is owned by the existing sole integrator.
It merged at `584e11413930869825631d7d48353161d5ac3bec` at 09:03 UTC while
this experiment was running. Its DesktopApp, DesignWorkspace, SlidesWorkspace,
SlidesSidebarLayout, editor assets and performance files are untouched here. Product edits are confined to
`src/components/ui/sidebar-resize-handle.tsx` and `sidebar.tsx`.

The existing Sidebar/Sheet/Provider composition and its normal open/close motion
stay in use. The shared handle is still the pre-existing custom pointer handle;
this partial candidate **does not complete the requested native Resizable
convergence**. Moving that boundary requires coordinated changes to #658's owning
files. No dependency, credential or security setting changes are included.

References checked: [official shadcn Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar),
[official shadcn Resizable](https://ui.shadcn.com/docs/components/radix/resizable),
and installed `react-resizable-panels` 4.12.3 declarations and implementation.
The installed `onLayoutChanged` is a settled callback; it does not save on every
pointer move. No persistence-frequency defect is inferred from that callback.

## Reproduction and evidence

`fixture.tsx` renders the actual shared Sidebar, SidebarResizeHandle and Resizable
components in a production profiling build. The contents are synthetic: 300 chat
articles, 300 navigation rows and an editable iframe with 80 authored image/text
sections. The mathematical text is ordinary text, not a native editor formula
renderer. Stream mode appends a local counter every 40 ms; no Agent or model is
called. `native` duplicates DesktopApp's present layout callback to isolate its
library behavior; it does not mount the whole DesktopApp.

This is a browser/React/layout experiment, **not** an authenticated production
workspace, real Design/Slides editor, live Agent output, server ACL or editor
loading qualification. No private user content enters the fixture or artifacts.

The baseline's actual-pointer regression fails because two frames after moving
100 px, the Sidebar is still only about 92 px into the move (the exact failure is
in `evidence/before-regression.txt`). In the first diagnostic drag, right-side
width error p95 was about 95 px and left-side error about 24 px, despite a frame
interval p95 near 17 ms. Those pilot numbers are diagnostic, not the final A/B.

The candidate caches gesture geometry, updates the Sidebar's existing width
variable during pointer movement without owner state updates, and commits the
settled width once. A scoped data attribute pauses the native Sidebar's width
transition during the drag; ordinary open/close still uses that transition.
Release, cancellation, lost capture and unmount clear gesture ownership.

`drag.py` runs 10 trials per arm per case, with AB/BA alternation. Each gesture
has 120 real mouse moves, two continuous round trips, and ends 30 px from its
start; it is not throttled or reduced to a final-position-only update. The first
trial of each case/arm records a Chromium trace, WebM and screenshot. CDP layout,
style/script/task durations, rAF intervals, pointer-to-width error, >50 ms long
tasks, profiling React commits, owner callbacks and persistence writes are
retained in `evidence/results.json.gz`. Trace paint costs are also reported for
trial 0. rAF geometry sampling can itself force layout; both arms have the same
instrumentation, so these are instrumented costs, not unobserved product CPU.
The raw >16.667 ms ratio is susceptible to 60 Hz timestamp jitter; >33.34 ms and
>100 ms observations are included separately. `summary.json` explicitly gives
the p75 of the ten per-gesture p95 values, not a pooled frame p95.

There is **no new cold/warm/retained editor-loading p50/p75/p95 measurement** in
this partial candidate, and no claim that loading improved by 50%. The upstream
#658 description itself reports that the #652 cold-start target remains unmet.
Its historical editor results cannot be relabelled as this candidate's results.

## Final local drag observations

Chromium 154.0.8037.57, Linux x86_64, 1440×1000, loopback/no link or CPU
throttling, production React profiling build, 60 Hz reference budget. There are
80 completed gestures (10 per arm for each of four cases). All retained the
synthetic input/frame and reported no browser page errors.

| Measurement | Right control → candidate | Left control → candidate |
| --- | --- | --- |
| p75 of ten gesture width-error p95 values | 127.73 → 0.01 px | 35.86 → 0.01 px |
| median owner width callbacks / gesture | 120 → 1 | 120 → 1 |
| median React commits / gesture | 81 → 2 | 113 → 2 |
| median CDP layout duration / gesture | 624.99 → 423.27 ms | 843.12 → 568.06 ms |
| p75 of ten gesture frame-interval p95 values | 16.8 → 16.8 ms | 16.8 → 16.8 ms |
| median share of intervals >33.34 ms | 0.21% → 0% | 0.53% → 0.34% |
| raw share of intervals >16.667 ms (median) | 61.7% → 62.3% | 63.0% → 62.9% |

For the streaming counter case, median owner callbacks fall 120→1 and React
commits 178→100.5; the counter's own updates still occur. The native library
control remains about 116 commits and 0.01 px width error in both arms; that
unchanged path is not attributed to this fix. All persistence write counters
are zero: shared sidebars do not persist width, and the native control's copied
DesktopApp selector misses its target as documented below.

**Residual observations:** the largest per-gesture frame p95 is 33.4 ms in the
control and 33.3 ms in the candidate. Across all cases, the observer records 6
control and 7 candidate long tasks (the browser reports durations rounded to
whole milliseconds; two candidate entries are reported as 50 ms). The final
candidate streaming trial includes a 122 ms long task and one >100 ms frame
interval; the control streaming trace has two >100 ms intervals. The candidate
therefore does not establish the full ≤33 ms / stall-free acceptance target.
Raw >16.667 ms ratios alone are not drop-frame rates because 60 Hz timestamps
straddle that threshold. Neither an unchanged frame median nor the width-error
improvement establishes production editor performance.

## Commands

Run from the repository root, with existing dependencies and Python Playwright /
Chromium. Video recording requires Playwright's ffmpeg binary. For this executor,
it was installed only under `/tmp/660-playwright` with
`PLAYWRIGHT_BROWSERS_PATH=/tmp/660-playwright python -m playwright install ffmpeg`.
The ephemeral test Chromium uses the container launch default (`--no-sandbox`);
no product browser flags, proxy policy, system trust or product security settings
are changed. It never opens production.

```sh
mkdir -p .codex-tmp/660-baseline-src
git archive afe539b9175e924a1ba95490bb838b99d68feb58 src tailwind.config.ts | tar -x -C .codex-tmp/660-baseline-src
node perf/issue-660/build.mjs .codex-tmp/660-baseline-src /tmp/660-baseline
node perf/issue-660/build.mjs . /tmp/660-candidate
# Start these two read-only static hosts in separate terminals:
python -m http.server 4461 --bind 127.0.0.1 --directory /tmp/660-baseline
python -m http.server 4462 --bind 127.0.0.1 --directory /tmp/660-candidate
# Run benchmarks alone, without simultaneous builds/tests/browser runs:
PLAYWRIGHT_BROWSERS_PATH=/tmp/660-playwright python perf/issue-660/drag.py /tmp/660-final 10 baseline=4461 candidate=4462
python perf/issue-660/regression.py 4461 /tmp/660-before-regression # expected failure
python perf/issue-660/regression.py 4462 /tmp/660-regression
node --import tsx --experimental-test-module-mocks --test src/features/design/DesignWorkspace.test.tsx
npm run lint
npm run typecheck
npm test
npm run build
```

## Remaining integration gates

- Coordinate native Resizable composition in Design/Slides navigation with #658;
  do not merge this partial handle optimization as full issue acceptance.
- Fix and independently test DesktopApp's width persistence selector in its owning
  file: `[data-panel="conversations"]` matches nothing in installed 4.12.3, which
  emits `data-panel="true"` and `id="conversations"`. The native probe consequently
  observes **zero** writes; this is not proof of a healthy persistence path.
  Use the actual owning element/ref or `#conversations[data-panel]`, then verify
  a changed gesture saves once and a reload restores it. This branch leaves that
  shared owner untouched under the parent task's shared-owner coordination constraint. #658 is now merged; the next owner
changes should be coordinated against that integrated main.
- After #658 is settled, establish click-to-operable cold/warm/retained/refresh
  loading baselines for real workspaces and alternate candidate/control at least
  ten times. Capture Network/Resource Timing and real editor initialization cost.
- Replay real Design/Slides heavy documents, true streaming, keyboard/touch,
  iframe crossing, focus/scroll, gesture cancellation, rapid toggles, resize,
  conversation/artifact/account switches, grant renewal and write revocation.
  The current synthetic frame/draft regression does not establish those ACLs.
- Inspect list move behavior separately: neither the current ConversationsPane
  path nor DeckNav contains a list reorder/drag/drop handler in the inspected
  source. Pane resize evidence must not be relabelled as list-move acceptance.
- Obtain independent final-candidate review and current CI before the sole
  integrator decides any merge. Only that integrator coordinates production.

## Local checks on the product candidate

- `npm run lint`: exit 0, 46 existing warnings and 2 informational diagnostics.
- `npm run typecheck`: passed.
- `npm test`: 151 passed, 0 failed.
- Owning `DesignWorkspace.test.tsx`: 3 passed, 0 failed.
- `npm run build`: passed (including required prebuild and typecheck); Vite built
  the production web output. Existing annotation/CSS/bundle warnings remain.
- Shared-component browser regression: both sides passed pointer tracking, one
  settled callback, keyboard/focus, scroll preservation, cancellation, retained
  synthetic edits/frame, reduced motion and narrow layout. CDP touch drag with
  immediate release also passed. This is not physical-device touch qualification.
- `git diff --check`: passed. Final independent review and PR CI are pending;
  these local checks are not an independent review or a production receipt.
