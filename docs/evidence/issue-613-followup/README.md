# #613 follow-up: guarded inline dollars in Design and GenUI

Base: `6070ead496d6c7ef7094e408297a7ee34fb8a0e4`. This continues #613 after
#615/#620; it does not repeat the Slides work in #636.

## Evidence and boundaries

The actual [new comment](https://github.com/LingXi-Org/LingxiLoop/issues/613#issuecomment-6574336089)
is by leecyang, posted 2026-11-02 10:02:46 UTC. It identifies a saved Design
`Roadmap.dc.html` and shows the public RNN source `$h_t = f(h_{t-1}, x_t)$`.
It reports an Attention screenshot with TeX commands, but supplies neither the
original HTML nor a public screenshot attachment. The screenshot capture time
cannot be established from the comment timestamp. `design.check=0` is explicitly
non-rendering evidence, not visual acceptance.

During this follow-up, public `/api/meta` reported API commit
`e36a13762cd8683d741a06b91173b7d86876b5e4`, SDK 3.8.21. This includes #615/#620;
it does not establish the screenshot's client resources or capture version.
Public `/readyz` returned HTTP 403 and was not retried through another route;
this task makes no production health claim.

No LingxiLoop MCP tool or diagnostic-token binding is available in this task.
The documented tester diagnostic views cover runs/operations, not artifact file
reads. Reading the original artifact's `project/canvas.json` and
`project/Roadmap.dc.html` was **not attempted through guessed URLs**. Original
file retrieval remains the integrator's pending authorized read. No other
ChatGPT session/private attachment was accessed; no production artwork was
written. The fixtures here are independent public-formula samples, not a copy
of the unavailable original. Actual Roadmap and #612 acceptance remain open.

## Confirmed gap and change

The current shared renderer supports explicit delimiters but deliberately leaves
single dollars literal. A real Design editor and real GenUiCard fixture on that
baseline showed six existing explicit formulas rendered while the new RNN and
independently authored single-dollar Attention sample remained raw. See
`roadmap-baseline.json`, `design-before.png`, `inline-before.png`.

The existing explicit KaTeX auto-render pass is preserved. A small single-dollar
selection pass uses the installed KaTeX delimiter/brace splitter and renderer;
it does not parse TeX itself. It retains amounts, escaped dollars, backtick code,
source templates and invalid math as text. A price before a formula cannot
consume the latter's opening delimiter. Code/pre and `.no-math` are excluded;
the new pass also skips editable content. `trust:false`, expansion/size bounds,
CSP and iframe permissions remain unchanged. Formula source is never saved back
to an artifact model. Single-dollar long formulas are keyboard focusable.

Supported additions include `$x$`, `$x^2$`, `$2^n$`, RNN and the delimited
Attention example. Numeric dollars without math notation, whitespace-bounded
or ordinary multiword dollar text remain literal; use existing `\(...\)` or
`\[...\]` for ambiguous expressions. Bare un-delimited commands are not guessed.
Formulas must remain within one HTML text run, as in the existing renderer.

Initial and late GenUI resource detection recognizes the added syntax while a
plain `$5 and $10` view still does not await/download math. Docker inputs and CI
filters include the new helper; no dependency version or Slides file changed.

## Reproduction and checks

Use the public Web profile without the unavailable private SDK for this isolated
browser fixture, or the normal authenticated locked project environment:

```
npm run build:visualize-runtime
npm run dev -- --host 127.0.0.1 --port 5285
python scripts/check-artifact-math.py --entry design
node scripts/check-artifact-math-cdp.mjs
node --test scripts/artifact-math.test.mjs scripts/ci-scope.test.mjs
node --import tsx --test src/features/chat/visualize/web/document.test.ts src/features/chat/visualize/web/resource.test.ts
```

The before capture ran `--roadmap-baseline` against the pre-change generated math
resource. The flag expects the old six-formula result and is intentionally not
a success expectation after rebuilding the fix.

The Design browser check uses the actual generated editor, its full-screen/back-to-
canvas controls and runtime template update. The GenUI check uses real GenUiCard,
opaque frames and the same CDP context-discovery approach as the existing
`check-visualize-reopen.mjs`, with native mouse input for expand/collapse/reopen.
CDP evaluation explicitly sets `allowUnsafeEvalBlockedByCSP:false`. API/files are deterministic local
fixture data. Production outer origin policy, tenant ACLs and live generation
are not exercised. Design assertions target visible frames; GenUI assertions and screenshots use
actual guest execution contexts to avoid intermittent Playwright frame metadata.

The fixed sample has eight formulas, loaded KaTeX faces, untouched amounts/code,
readable invalid input, and no duplicates through updates, reopen and refresh.
240px content width checks retain font size and keep display formula overflow
inside a focusable scrolling region; inline math can wrap at KaTeX base breaks.
`contentHeight`/`formulaFont` are recorded for coordination with #612, not a
claim that the original Roadmap is correctly sized. Existing
`lingxi:math-ready` still fires after render/fonts; no container measurement or
host resizing owner was changed.

Some early fixture attempts ran before Vite was ready; a Playwright string
predicate also encountered existing CSP and was changed to a function predicate.
No security policy was relaxed for testing. Final browser and CI results are
reported on the draft PR; the earlier failed attempts are not counted as passes.

The optional Playwright `--late` path and, later, some ordinary GenUI page runs
intermittently could not locate the opaque content frame (31px/240px, expanded
and inline). Those attempts are not counted as passes, and no claim attributes
them to production. The CDP counterpart passes initial math, RNN source changes,
narrow width, expand/collapse, reopen/refresh and late single-dollar math after
an initial price-only document, without changing CSP or product lifecycle. Its
late-only fixture declares `min-height:240px`; it is not a general acceptance
claim about arbitrary short-view geometry. That boundary is retained for #612.
Full-window Design capture clears the test-only 240px width constraint before
entering the editor's full-screen mode.

## Final candidate verification

- PASS: 5 artifact/math-source tests, 11 document/resource tests, 4 CI-scope
  tests and the SPA image source-graph contract (21 focused checks).
- PASS: explicit strict TypeScript check of both shared math modules; focused
  lint; `verify:visualize` (223 pinned files); runtime/Design resource build.
- PASS: `--entry design` with eight formulas, actual RNN source update,
  240px content, full-screen/back, reopen/refresh and readable invalid math.
- PASS: CDP GenUiCard check with eight formulas, RNN update, matrix/aligned/
  Attention structure, native expand/collapse/reopen, refresh, 240px overflow,
  and delayed single-dollar math after a price-only mount. Screenshots were
  visually inspected; reported math font is 19.36px with no font shrink added.
- PENDING: original Roadmap file/screenshot replay, #612 joint acceptance and
  independent integrator review. No original production file was obtained.

Latest main was rechecked at `6070ead4` before submission. PR #639's stated
MarkdownText, DesignWorkspace, open-design, Slides and conversation-state files
are not modified here. The two GenUI loader detection expressions are changed
only to recognize the syntax this patch adds; existing transport, loading
budget, cancellation, authorization and sizing owners stay in place.
