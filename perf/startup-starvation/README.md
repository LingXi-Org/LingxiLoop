# Homepage starvation, boot flicker and lazy surfaces

## Reported symptoms

Homepage slow, flickering several times and sometimes never loading; interactive
views slow; the side design canvas janky and slow to show; Slides assistant and
editor slow to open.

## Root causes found

1. **Continuous React updates starved the conversation thread.** Every visible
   animated agent avatar (`BloubAvatar`) called `setState` from the shared rAF
   clock at 20–60 fps. With a populated conversation list the app committed
   **~33 React updates per second forever**, even when idle. The message thread
   mounts behind a Suspense boundary; React retries a suspended boundary in a
   time-sliced *retry lane*, and retry lanes never expire. Each retry needs
   ~0.5 s of Markdown rendering and was restarted by the next avatar frame, so
   on a slower link the thread stayed on "正在打开会话" indefinitely (this is the
   "never loads" case; CPU stays busy the whole time).
2. **Boot flicker.** The default dark theme was applied only after the bundle ran
   (white → dark flash). Three boot phases each mounted a fresh full-screen
   skeleton with a fade-in, then the page and the conversation each faded in
   from transparent: 8–12 full-surface repaints per load.
3. **The thread pulled renderers it rarely needs.** KaTeX, the GenUI card with
   its MCP App bridge, the homework editor (forum/content pipeline) and the file
   viewers were static imports of every conversation.
4. **Serial waits.** Route modules were discovered one parent at a time; the
   design canvas only expanded after its ensure request; the Slides assistant
   waited for a full conversation-list reload even when its channel was known;
   every IM event issued its own conversation-list read.

## Changes

| Area | Change |
| --- | --- |
| Avatars | Animation frames are painted straight into the avatar's SVG layer; no React state per frame. Idle commits: 33/s → 0. |
| Boot | Theme applied by an inline script before first paint. One static shell in `index.html` paints with the stylesheet and is handed between boot phases (`WorkspaceSkeleton` holds it), so no phase remounts or fades. Skeletons no longer fade in and appear only after 120 ms. First-mount page/conversation entrances are skipped (changes still animate). The retired Electron notification-window snippet is removed. |
| Code loading | Boot route modules are `modulepreload`ed at low priority. A link to a conversation starts the message renderer with the shell. KaTeX loads only for text with math syntax; GenUI card, homework editor and file viewers load on use (GenUI prefetches after the thread renders). |
| Design canvas | Expands on click with a placeholder; editor code starts on hover/focus/press, in parallel with the ensure request. Closing the placeholder or a failed ensure leaves it closed; scope checks are unchanged. |
| Slides | An already authorized assistant channel opens without waiting for the list refresh (a new channel still waits). Pointing at or focusing a deck starts its workspace and assistant code. |
| Conversation list | Event bursts coalesce into one in-flight read plus one trailing read. |

No server, authorization, sandbox, CSP, grant, storage or migration change.

## Measurements

Local production builds (`vite build`) of `2b33a54c` (baseline) and this branch,
served by [`serve.mjs`](serve.mjs) with gzip, immutable asset caching and a fixed
150 ms API delay: 12 conversations, 40 Markdown messages with code and tables,
no realtime backend. Chrome 156 (Windows), 1440×1000, cold context per sample,
arms alternated A/B then B/A. "Ready" means messages are rendered and no boot
shell or skeleton is visible. [`compare.py`](compare.py) also counts React
commits during 2 s of idle time (via a DevTools hook) and full-surface
fade/skeleton repaints. Raw samples are in [`evidence/`](evidence).

| Profile | Arm | Ready p50 / p75 (ms) | Stuck > 30 s | Idle commits/s (median) | Full-surface repaints |
| --- | --- | --- | --- | --- | --- |
| Unthrottled (run with 4 Mbps arm) | baseline | 2,645 / 2,689 | 0/6 | 34.0 | 8–10 |
| Unthrottled (run with 4 Mbps arm) | candidate | 2,451 / 2,612 | 0/6 | 0 | 0 |
| 4 Mbps, 20 ms | baseline | — | **6/6** | 34.0 | 12 |
| 4 Mbps, 20 ms | candidate | 4,928 / 4,975 | 0/6 | 0 | 1 |
| Unthrottled (run with 150 ms arm) | baseline | 2,736 / 2,770 | 0/6 | 33.5 | 8–10 |
| Unthrottled (run with 150 ms arm) | candidate | 2,517 / 2,586 | 0/6 | 0 | 0 |
| 20 Mbps, 150 ms | baseline | — | **6/6** | 33.8 | 12 |
| 20 Mbps, 150 ms | candidate | 4,029 / 4,102 | 0/6 | 0 | 1 |

The one remaining large repaint in throttled runs is the 120 ms-delayed thread
skeleton, shown only because the message renderer is still downloading. In an
earlier development run the baseline also stalled once unthrottled (1/6).

The conversation thread's static (non-lazy) graph falls from 3,882,116 to
2,979,003 minified bytes ([`thread-graph.mjs`](thread-graph.mjs)). In a 4 Mbps
sample, JS transferred before ready fell from 1,316,321 to 1,093,468 bytes.

Route `modulepreload` was measured separately: at normal priority it cost ~13%
at 4 Mbps (it competed with the stylesheet) while saving ~13% at 150 ms RTT; at
low priority it was neutral at 4 Mbps (+2%, within noise) and −5.5% p50 at
150 ms, so it ships at low priority.

Unthrottled ready time is dominated by the fixture's serial API chain and moves
only 7–8%; the substantive gains are the removed starvation, the flicker and the
bandwidth/latency-bound cases.

## Regression checks

- `src/components/BloubAvatar.test.ts`: a frame paints a complete, self-referencing avatar; caller colors cannot escape their attribute.
- `src/features/design/open-design.test.ts`: the canvas expands on click, then shows the ensured board once; closing the placeholder or a failed ensure leaves it closed; scope changes never open a private board. The expansion assertion fails on the old code.
- `src/components/assistant-ui/markdown-text.test.tsx`: prose renders without KaTeX; math syntax loads it and renders it identically.
- `perf/issue-626/slides-loading.mjs`: new check that a known assistant channel opens while the list refresh is still pending (times out on the old code). Its store mock gained the `list` field the real store always has.
- `scripts/check-slides-retention.mjs` (library still does not load workspace code before intent) and `perf/issue-626/startup-graph.mjs` (empty conversation still does not import the message renderer) pass unchanged.

## Reproduce

```sh
node node_modules/vite/bin/vite.js build --manifest --outDir <out-dir>
node perf/startup-starvation/serve.mjs <baseline-out> 4301
node perf/startup-starvation/serve.mjs <candidate-out> 4305
python perf/startup-starvation/compare.py 6 perf/startup-starvation/evidence/paired-4mbps-20ms.json baseline=http://127.0.0.1:4301/ candidate=http://127.0.0.1:4305/
NET='{"offline": false, "latency": 150, "downloadThroughput": 2500000, "uploadThroughput": 1250000}' python perf/startup-starvation/compare.py 6 perf/startup-starvation/evidence/paired-20mbps-150ms.json baseline=http://127.0.0.1:4301/ candidate=http://127.0.0.1:4305/
node perf/startup-starvation/thread-graph.mjs .
```

## Not measured

Production traffic, real IM/realtime, the real Design editor (its 1.8 MB entry
and per-grant origin are unchanged) and the real Slides editor bundle (its opaque
sandbox still prevents HTTP cache reuse across opens). The fixture machine runs
third-party security software that injects scripts into every page; both arms
are equally affected.

## Integrator regressions on the final candidate

The first `ced1794a` candidate failed two targeted checks: a late ensure response
from an old scope closed the next scope's pending canvas; reopening a folded
canvas replaced its retained editor with a placeholder and lost an unsaved draft.
The fixes compare the pending surface by object identity and keep this
conversation's existing editor mounted while ensure is pending.

Observed in Chromium 154 on Linux with real DesignButton, DesignWorkspace,
Sidebar, ArtifactView, ArtifactEditorFrame and the Zustand surface store:

- Closing during ensure does not reopen the canvas on the late response.
- An ensure failure can be retried successfully.
- Folding/reopening retains the same frame, one grant and the edited draft.
- Old account/company/project/conversation responses cannot replace or close a
  newer scope's placeholder; the old board receives no editor grant.
- The 390px native sidebar opens and closes with an editable child.

The APIs are deferred synthetic responses and the child is a small editable
fixture, not the full Design editor or an authenticated production session.
The unchanged Slides loading probe also passed: assistant code and workspace
readiness do not block the authorized editor, assistant failure/retry retains the
frame, send waits for saved context, and a known channel opens before list refresh.
The actual conversation store's focused tests cover burst coalescing, trailing
reads, failed refresh retry and stale account/company/project reads.

Reproduce the Design regression (Playwright is a local probe dependency):

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191 --strictPort
# In another terminal, use the installed Playwright package or its module path:
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs node perf/startup-starvation/design-smoke.mjs
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/design/open-design.test.ts src/features/design/DesignWorkspace.test.tsx src/features/conversations/reload.test.ts
node perf/issue-626/slides-loading.mjs
```

Thirty renderer/Design/avatar checks passed before the final retained-frame fix;
the final affected Design/store checks (9), Design browser probe and Slides probe
passed afterward. Markdown's real primitive rendered lazy math, matrices, streamed
and invalid formulas while preserving citations and TeX copying. This is not an
additional full-editor formula export or live-provider acceptance.

Final candidate source typecheck (`tsc --noEmit`) and affected-file lint passed.
