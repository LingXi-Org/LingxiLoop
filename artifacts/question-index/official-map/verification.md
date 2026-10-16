# Complete official Conversation Map acceptance

This replaces the prior adapted dsh-turn-scrubber for issue #145. The five source
files are complete, byte-for-byte copies of assistant-ui revision
`2f3690c03954cac275f9bf9c26d81a18fc1e5ec0`, including both published variants and
all three local dependency modules. Their contents were independently downloaded
again from the pinned raw GitHub URLs and compared byte-for-byte on 2026-10-16.
The product uses the official standalone component's public props; its internal
hover, preview, selection and keyboard implementations have no edits.

The host uses the existing green `--primary` token, the official opacity tiers,
a 44px gutter, and a scrollable map with 18px per entry. Below the existing 768px
mobile breakpoint, the entire component and its preview portals are unmounted.
This is the final mobile requirement, superseding the issue's original narrow
screen index behavior. No production deployment is part of this change.

## Repeatable checks

See [browser setup and commands](../../../../e2e/question-index/README.md). From the
repository root, with the documented dedicated desktop-pointer Chromium running:

```sh
sha256sum -c third_party/assistant-ui-conversation-map/upstream.sha256
npm run lint
npm run test
npm run build
npx --no-install tsc -p e2e/question-index/tsconfig.json
npx --no-install tsc -p e2e/tsconfig.json
E2E_CDP_URL=http://127.0.0.1:9227 E2E_REDUCED_MOTION=1 E2E_TELEMETRY_DISABLED=1 npx --no-install e2e run --config e2e.question-index.config.ts --output .e2e/official-map-acceptance
E2E_VISUAL_CDP_URL=http://127.0.0.1:9227 E2E_TELEMETRY_DISABLED=1 npx --no-install e2e run --config e2e.visual.config.ts --grep 'chat order, delivery' --output .e2e/official-map-shell
```

Run browser suites sequentially when sharing the dedicated browser. Browser
navigation, interactions, screenshots and assertions use tester-army/e2e 0.17.0
and official @e2e-dev/web 0.12.0. The reduced-motion helper only configures a native
CDP media preference, awaits `matchMedia`, and then verifies immediate positioning,
visible keyboard focus and disabled transition properties. No Playwright API is
imported or invoked.

## Results

- All five upstream source checksums match; independent GitHub comparison matches.
- Web lint succeeds (two existing warnings and two informational diagnostics).
- All 87 existing web tests pass.
- Production typecheck/build and both E2E TypeScript projects pass. Vite retains
  its existing large-chunk warnings.
- Conversation Map acceptance: **11/11 pass**, run `01a14568-8de3-786a-81c4-76559a73d286`. See [original report](acceptance-report.json).
- Browser suite screenshots are retained alongside this document.
- Desktop/mobile shell regressions: **2/2 pass**, run `01a14564-8bb6-72f6-8474-c6fd60dec1f3` ([report](shell-report.json)), covering message order, delivery,
  timeout recovery and canvas scrollbar boundaries.

Before replacement, all three spacing reproductions failed: the 8-turn index had
approximately -3.05px hit-area overlap, and 320-turn desktop/mobile indices had
approximately -0.05px visible-bar overlap. Final desktop cases require separated
hit areas, at least 8px visible-bar gaps and at least 12px row heights, with fixed
row positions during hover. They also verify first/last keyboard jumps, an
independently scrollable index and automatic active-marker visibility.

The final suite also covers green colors in both themes, text/attachment preview,
streaming without forced jumps, receipt deduplication, conversation switching,
reload, history failure/retry and anchor preservation. Mobile cases assert no
index or reserved gutter at 390px in both themes with 320 turns, and check that
an open preview disappears at 767px and the map returns at 768px.

Fixtures use synthetic IM history with the production converter, transport
pagination, store, assistant-ui runtime, thread, message and composer components.
These results verify UI/transport behavior, not a live IM/backend integration or
production deployment. Reports retain their original run IDs and results; trace
archives remain local under `.e2e/`.

## Screenshots

- [8 turns: separated rows](short-history.png)
- [320 turns: middle preview and independent scroll](dense-history.png)
- [320 turns: last entry reachable](dense-history-last.png)
- [Official hover and green theme](official-hover.png)
- [Light theme preview](light-preview.png)
- [Mobile light: index omitted](mobile-light.png)
- [Mobile dark: index omitted](mobile-dark.png)
- [768px desktop breakpoint](desktop-breakpoint.png)
- [Reduced motion and keyboard focus](reduced-motion.png)
