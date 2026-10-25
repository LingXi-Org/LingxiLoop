# #445 / #446 focused acceptance

Baseline: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`.
Product commits: `671c153d0782345eb302b332d205bc395bc3c1c5` (#445),
`612fd6f0e3efb3347c6b3a97bfacd2b32a67d445` (#446).
The following fixture/evidence commit does not change product source.

## Measured results

The same synthetic scene mounts the actual `ConversationsPane`/Virtuoso and
`ConversationComposer` with the official assistant-ui external-store runtime.
Chromium 154.0.8037.57, Node 22.23.3, official `e2e` 0.17.0 and `@e2e-dev/web`
0.12.0 ran at 1440×1100 and 390×1100. Browser sandboxing remained enabled.
Only local synthetic public text was used. No backend request was attempted;
the fixture additionally rejects backend, cross-origin, WebSocket and EventSource
requests. It contains no real student records or production connection.

| Actual geometry | Before | After |
| --- | --- | --- |
| Conversation without run status, both widths | 69.25px / 2 lines | 70px / 2 lines |
| Processing, waiting for input/approval, completed, failed | 89.25px / 3 lines | 70px / 2 lines |
| Virtual item pitch, both widths | 77.25px or 97.25px | 78px, including the existing 8px spacing |
| Empty normal/compact Composer, desktop | 90px | 54px |
| Empty normal/compact Composer, narrow | 134px | 62px |
| Persistent learning-help buttons | 3 | 0 (container removed) |

Status appearance, transitions and removal retain the same row height/top.
Typing, long titles/previews, time, pinned/muted indicators and unread badges
remain present; titles truncate and neither text nor icons overlap. The actual
virtual list rendered only 15/13 of 140 rows, selected the final row, scrolled
back to the first row at its original top, and retained keyboard/tap selection.
The 78px initial estimate now matches observed pitch; automatic sizing remains.

Composer acceptance passed at both widths: normal/compact surfaces have one
visible editor/action row and no learning-help DOM or focus target; Shift+Enter
preserves multiline text; the add menu opens above the editor within the viewport
and closes with Escape; a local text attachment and quote survive stopping; send
records the exact multiline text and one attachment, then clears text/quote.
Switching the supplied conversation ID and remounting the shared Composer does
not restore the retired controls. The thread owner uses this same Composer with
`compact` and a different placeholder; a full authenticated thread route was
not separately exercised.

## Screenshots and raw evidence

| Scene | Before | After |
| --- | --- | --- |
| Desktop list + normal Composer | [before](screenshots/before-list-1440.png) | [after](screenshots/after-list-1440.png) |
| Narrow list + normal Composer | [before](screenshots/before-list-390.png) | [after](screenshots/after-list-390.png) |
| Desktop compact Composer | [before](screenshots/before-composer-compact-1440.png) | [after](screenshots/after-composer-compact-1440.png) |
| Narrow compact Composer | [before](screenshots/before-composer-compact-390.png) | [after](screenshots/after-composer-compact-390.png) |

Exact row dimensions, status transitions, menu bounds and send results are in
[`measurements/`](measurements/). [`provenance.json`](provenance.json) records
fixture/test source and saved artifact SHA-256 digests. The runner records the
product commit, but its dirty flag excludes the then-untracked fixture; these
explicit digests identify that additional source. Baseline and initial candidate
fixtures were identical. The final candidate fixture only corrected the
synthetic cancelable run identity/owner described below, leaving initial scenes
and list behavior unchanged.

## Checks and execution record

- `ConversationList.test.tsx`: 3/3; the new two-line assertion failed with
  `3 !== 2` before implementation. Existing composer composition tests: 2/2.
- Changed product files and new fixture/test/config files: targeted Biome passed.
  `tsc -p e2e/chat-layout/tsconfig.json` and `git diff --check` passed.
- `npm run build`: passed, including prebuild and application/node TypeScript;
  Vite completed in 50.03s. Existing chunk-size warnings remain unchanged.
- Baseline Composer case passed in [first run](runs/before-first-report.json).
  Its list locator initially assumed `data-slot="item"`, but ContextMenuTrigger
  supplies its own slot. Selecting the actual button corrected the test;
  [list-only baseline run](runs/before-list-report.json) passed.
- Candidate list case passed in [first candidate run](runs/after-list-first-report.json).
  The Composer case measured the opening menu mid-animation (2.61px from its
  target), so the test now polls the same original <2px geometric condition.
  No tolerance was loosened.
- [Next Composer-only run](runs/after-composer-fixture-failure-report.json)
  exposed invalid synthetic run ownership: the fixture lacked the native
  `run-${runId}` identity, `refs.agentId` and `controlPrincipalId` required by the
  real converter. The fixture was corrected, and a direct probe through the
  actual converter and `canCancelRun` verified it before the next browser run.
  Product permission checks were not changed.
- [Final Composer-only run](runs/after-composer-final-report.json) passed in
  4.62s, covering both widths. Only the failing case was rerun; the passed list
  case was not repeated. All browser runs used one worker and zero retries.

Reproduction (build once, then serve each checkout on a different loopback port):

```sh
node node_modules/vite/bin/vite.js build --config e2e/chat-layout/vite.config.ts
node node_modules/vite/bin/vite.js preview --config e2e/chat-layout/vite.config.ts --host 127.0.0.1 --port 5197 --strictPort
E2E_BASE_URL=http://127.0.0.1:5197 E2E_CDP_URL=http://127.0.0.1:9337 node node_modules/e2e/dist/cli/bin.js run --config e2e.chat-layout.config.ts
# For the baseline checkout/app, also set CHAT_LAYOUT_BASELINE=1.
```

The evidence demonstrates the source-confirmed defects with real shared
components and synthetic data. It does not claim reproduction of the original
reporter's unknown device/session, a production release, real transport delivery,
or full-route authenticated acceptance. The old Visualize learning fixture was
updated only to remove the deleted consumer and retain manually entered work;
its separate topology flow was not rerun. No independent review, expanded test
matrix, dependency/runtime change or production write was performed. Exact-head
CI and the draft PR are reported in the PR handoff; merge/deploy/closure remain
with the designated release coordinator.
