# #246 corner clipping: deterministic red/green evidence

The owning product change is one line in `GenUiCard.tsx`: use the full anchor
width without the previous -5 px margin and extra 10 px width. The guest's
existing 5 px paint gutter is now retained inside the rounded public card.

The [failure model](FAILURE-MODEL.md), fixture and official `@e2e-dev/web` test
were written first. The unchanged component failed both viewport cases before
the one-line change; the same two tests passed afterward.

| Check | Before | After |
| --- | --- | --- |
| 1440 px viewport | Failed | Passed |
| 390 px viewport | Failed | Passed |
| Four content edge insets | 0 px each | 5 px each |
| Four host corner hit tests | All false | All true |
| Guest frame / card height | 230 / 220 px | 230 / 230 px |
| Content width at 1440 / 390 | 960 / 342 px | 950 / 332 px |
| Preview, collapse, retained local state | Not reached after failed assertion | Passed at both widths |
| Dynamic 1440 → 390 resize | Not reached after failed assertion | Passed |

The actual rounded radius is 12 px. The geometric minimum symmetric inset is
3.5147 px, so the retained 5 px gutter protects the authored root rectangle.
No global SVG resizing, generated content rewrite, sandbox/CSP or authorization
change is included.

Evidence:

- [Before log](../../../artifacts/issue-246-layout/before/run.txt):
  2 failures, exit 1, run `01a15a30-ae18-75e1-9b9e-e993377ade80`.
- [After log](../../../artifacts/issue-246-layout/after/run.txt):
  2 passes, exit 0, run `01a15a31-2ee2-770f-be7d-fde1fbaa2ba5`.
- [Before mobile geometry](../../../artifacts/issue-246-layout/before/corners-390-initial.json)
  and [after mobile geometry](../../../artifacts/issue-246-layout/after/corners-390-initial.json).
- [Before mobile screenshot](../../../artifacts/issue-246-layout/before/inline-corners-390.png)
  and [after mobile screenshot](../../../artifacts/issue-246-layout/after/inline-corners-390.png).
- [After preview screenshot](../../../artifacts/issue-246-layout/after/preview-corners-390.png)
  and [after resize screenshot](../../../artifacts/issue-246-layout/after/resized-corners-1440.png).
- [E2E typecheck log](../../../artifacts/issue-246-layout/e2e-typecheck.txt):
  exit 0.
- [Source hashes](../../../artifacts/issue-246-layout/source-hashes.json)
  and [artifact checksums](../../../artifacts/issue-246-layout/SHA256SUMS).

Reproduce from repository root (use a fresh output directory for each run):

```sh
E2E_TELEMETRY_DISABLED=1 \
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/e2e-browsers \
E2E_VISUALIZE_OUTPUT=.e2e/246-after \
node_modules/.bin/e2e run --config e2e.visualize-corners.config.ts
```

The parent #244 loading changes were present in both red and green runs. Only
the anchor style changed between these runs. Raw reports retain the runner's
original `.e2e` artifact paths; the selected screenshots and geometry are copied
alongside the logs for repository review.

Limitations: source inspection confirms the unchanged `captureBounds(5)` crop
still matches the guest gutter. Native clipboard access was previously denied
and was not retried; this is not a native image-copy acceptance result. Arbitrary
authored shadows or content overflowing its root bounds are not covered. The
generated 16 by 16 marker and fixed SVG without a `viewBox` documented in the
failure model remain separate content issues. No new model calls were made.
