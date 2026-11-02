# Design natural-height pages — #612

Base: `90e89e42` (includes the deployed #626 loading, #628 sidebar and #640
single-dollar math changes). This candidate changes Design's geometry owner;
the math parser, grant isolation, loading lifecycle and published SDK stay in
their existing owners. The #613 owner separately replayed the original formulas.

## Actual source and failure

The user supplied two original files in [comment 6576721208](https://github.com/LingXi-Org/LingxiLoop/issues/612#issuecomment-6576721208),
at fixed source commit `4d5abe3e5307cbea55533f6f32ef158bbecc5593`:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| project/canvas.json | 426 | 9ea199d03f506b9528681361118e5b9cd0e34ba2c7bceb5dc6d999ae7a5c84e3 |
| project/Roadmap.dc.html | 9527 | 5260ac66ada5f34423a7bfddf313a33f2d9d2c29c090c61275ed5c78bf34bfdb |

Both local copies match those bytes and hashes. They remain in the ignored
`.codex-tmp/issue-612/original/project/`; this PR does not copy the original
package into another public branch. The committed control is a short,
independent sample. Original screenshots remain local alongside the replay.

The index declares 1280×1180, with neither `frameless` nor `expand:fill`.
The root has `width:1280px; min-height:1180px`, with automatic height. Its seven
stages actually occupy about 1714px after the two formulas render. The native
content-hull-to-model path handles frameless pieces only, so this ordinary
artboard retains its 1180px frame. With classic scrollbars, the vertical
scrollbar leaves 1265px of available width and the 1280px root also overflows
horizontally. The original archive is unchanged by the build.

Same original copy, Chromium 154.0.8037.57, Debian cloud, 1800×1215 CSS px,
device scale 1, real DesignWorkspace/editor/gateway, classic scrollbars
(`ignoreDefaultArgs:['--hide-scrollbars']`), no CSP override:

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Artboard/guest viewport | 1280×1180 | 1280×1715 |
| Available document area | 1265×1165 | 1280×1715 |
| Scroll extent | 1280×1714 | 1280×1715 |
| Natural root height | 1714.17 | 1714.17 |
| Heading font | 44px | 44px |
| Rendered formulas | 2 | 2 |

An earlier ordinary headless run used overlay/hidden scrollbars and reproduced
only the vertical excess. The classic-scrollbar replay above reproduces both
directions. `document.fonts.status` is loaded; this records the fonts actually
available in this environment, not successful delivery of every remote Noto
variant. No timing speedup is claimed.

## Bounded implementation

An artboard guest reports its single natural-height root when the author has
specified a positive minimum height and automatic height. Explicit height,
maximum height, positioned/transformed roots and authored scrolling viewports
do not opt in. The report keeps the existing frame width and is admitted only
from the native checked iframe owner at its current width, outside full-window
or playback mode. Values outside the format's 40–8000px height bounds are
rejected rather than truncated.

The existing 400ms merge, edit/read-only guard, gesture deferral, frequency
limit, history reconciliation, model serialization and CAS save path own the
change. When the page would cross a later row, later rows on the same canvas
page move together by the height increase. Free space left after shrinking is
reused by later growth, preventing repeated content toggles from pushing rows
ever farther down. Annotation movement delegates to native `moveAnnotation`,
so both ends of lines/arrows move together. Existing overlapping artboard
compositions and interactive viewports keep their authored geometry. Shrinking
does not pull later authored rows upward. No guest or overlay DOM is stretched
independently of the model.

The new programs add about 2.5KB before compression, load within the existing
entry/runtime programs and make no extra resource request. The public asset
hashes and precompressed variants continue through the original build.
Docker allowlists and CI owners include both new sources. New regressions run
from the existing Design package test entry; CI does not need a new job.

## Observed verification

`browser.json` retains the actual final replay, with original titles omitted.
Synthetic APIs provide document/grant responses and persistence; the actual
UI, isolated gateway, editor, native edit protocol and compare-and-swap publish
flow run in Chromium. This is not a production/API tenancy test.

- Original opens with both formulas and no internal overflow, without changing
  its HTML. The same iframe survives close/reopen. A 768px workspace retains
  complete content within the artboard.
- Async root content addition grows the model to the measured height; removal
  returns it to natural height. These mutations exercise async layout, not
  durable authoring of the added paragraphs.
- A real heading double-click/fill/Escape edits the original copy through the
  native editor, publishes the source, and survives page refresh. The shorter
  heading naturally changes its page height to 1660px. Another conversation
  retains the original heading and its own dimensions.
- Full-window/back uses the same complete page. No formula parser change is
  needed. Two rendered formulas and loaded font status remain observed.
- An original-copy variant adds one independent fixed artboard and an arrow on
  the next row. Growth by 535px moves the neighbor from y1300 to y1835, keeps
  its 200px fixed height, and moves both arrow endpoints by 535px. Repeating an
  async content expansion after removal keeps the neighbor at y3457 in both
  expanded states, confirming that spare space is reused without row drift.
- The independent public control includes text, image, wrapped code, table,
  inline RNN and display matrix. Its natural 875px height is fully retained.
  At 390px, the native outer canvas pan reaches the final paragraph while
  the guest's own scrollTop remains zero. Native zoom/pan remain the way to
  inspect an authored fixed-width composition; no smaller font is introduced.
- Focused model/source-hook and CI owner regressions, strict shared-module
  TypeScript, focused lint, diff checks and the SPA image input-graph contract
  passed. The Design package check verifies all generated JS, unchanged archive
  inputs, runtime fallbacks, font extraction and lossless compression.

Early probe failures: the compiler replaced its first srcdoc while a locator
was counting; retry now rediscovers the real mounted frame. A later multi-board
probe reused an already-seeded fixture document, so the expected variant never
appeared; that variant now acquires its own fixture document. Neither failed
attempt is counted as a pass.

## Reproduce

Obtain the two files only from the fixed links in the user's comment above,
preserve `project/`, and verify both hashes. Do not point the fixture at a live
production URL. Build the normal resources and existing product fixture:

```sh
npm run build:visualize-runtime
node scripts/build-design-editor.mjs
node perf/issue-611/build.mjs . .codex-tmp/issue-612/web
npm install --prefix /tmp/canvas-browser --cache /tmp/npm-cache playwright-core --no-audit --no-fund
PERF_PROJECT_DIR=.codex-tmp/issue-612/original/project \
PERF_DESIGN_DIST=server/assets/design-editor \
node --import tsx perf/issue-611/serve.ts . .codex-tmp/issue-612/web 4293
```

In another shell:

```sh
ORIGIN=http://127.0.0.1:4293 \
PLAYWRIGHT_MODULE=/tmp/canvas-browser/node_modules/playwright-core/index.mjs \
RESULTS_DIR=.codex-tmp/issue-612/replay node perf/issue-612/check.mjs
node --test scripts/design-editor.test.mjs scripts/ci-scope.test.mjs
node --test --test-name-pattern='SPA image' scripts/production-rag-contract.test.mjs
```

For the baseline, build `90e89e42` in a separate checkout, serve its Design
distribution with the same original project and UI fixture, and pass
`--baseline` to the checker. The source-hash assertions apply to both arms.

## Remaining gates and deliberate exceptions

Production acceptance and independent integrator review remain required.
No production artwork, secret, credential, migration, SDK or deployment was
changed. No issue is closed by this candidate.

Firefox/Safari and read-only-mode resizing were not exercised. Native
read-only guards still prevent model writes. Fixed interactions, overlapping
artboard compositions, explicit height/max-height/overflow, multi-root markup,
and content over the format's 8000px limit keep their existing scrolling/zoom
semantics. Arbitrary authored grids are not rewritten into responsive layouts.
The outer fixed-width canvas can require horizontal pan in a narrow panel;
this is distinct from nested horizontal/vertical scrolling inside the page.
Private production/model delivery and another user's live editing concurrency
are outside this deterministic copy replay.
