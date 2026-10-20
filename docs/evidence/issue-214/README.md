# #214 renderer acceptance — 2026-10-20

Implementation commit: `80c1aaeecc496c131f162c8c550443027b459cf3`, based on main `b7b165fd`. The later evidence commit changes documentation only. `provenance.json` records exact source file hashes and installed package versions. Native reports accurately record the working-tree run before the implementation commit was created.

## Results

- `npm run lint`: passed (existing warnings retained).
- `npm test`: 65 passed, 0 failed; existing content/layout assertions now read semantic text across the new word spans. No tests removed or skipped.
- `npm run build`: passed, including web/node typecheck. Existing chunk-size and CSS warnings retained.
- `npm run test:e2e:typecheck`: passed.
- Official `tester-army/e2e@0.17.0` / `@e2e-dev/web@0.12.0`: **7 passed, 0 failed**, desktop light 1440×960 and narrow dark 390×960, plus local verbatim-source comparison.
- Clean baseline at the same main, same lockfile install, browser engine, viewport, synthetic burst and 1800ms sampling: **4 passed**. The old tests missed the requested effect. `red/` demonstrates the new entry-effect assertion failing on the old implementation.

This is a short renderer regression, not a production soak or live-provider run. Both versions preserve incremental reveal and reach all 278 burst characters. We make no latency-speedup claim from these short, partially concurrent runs. The deterministic guard verifies **0 DOM mutations** in an already stable paragraph while the next paragraph grows; the existing SDK `minCommitMs: 32` remains unchanged.

The source comparison asserts identical computed entry animation/duration (500ms), color transition/duration (700ms), caret geometry (2×16px with 2px margin), radius, pulse and blue color. Every English reveal step has the correct newest-two-word window. The Chinese test observes many intermediate computed colors, stable node identity, two fresh CJK characters across a bold boundary, settled old paragraphs and one visible caret. Coverage includes bursts, slow words, mixed text, repeated whitespace/newlines, citations, inline/fenced code, tables, blockquotes, @ mentions, completion, cancellation, failure, regeneration/replacement and refreshed history. The reduced-motion queue test verifies no partial reveal; see the native media limitation below.

## Visual artifacts

- `product/001-official-source-product-same-input.png`: verbatim pinned official source and production MarkdownText, same English input.
- `product/f1b00f0a.webm`: source/product comparison and completion.
- `product/001-streaming-burst-light.png`, `product/001-streaming-burst-dark.png`: Chinese tail highlight and narrow caret.
- `product/002-streaming-markdown-dark.png`: narrow dark Markdown, quote, table, mention and inline code.
- `product/8388ac22.webm`: moving Chinese/mixed tail and stable paragraphs.
- Other PNG/WebM files cover interruption, completion, history and queue bypass; native JSON (losslessly gzip-compressed), JUnit and Markdown reports are retained. Build/lint/unit/typecheck logs are in the top-level `.txt` files.
- `baseline/`: unmodified main screenshots/reports, under the same installed dependencies.

## Remaining acceptance blockers (not bypassed)

1. Live website browser navigation to `https://www.assistant-ui.com/elements/streaming-text` **failed**, `ERR_CERT_AUTHORITY_INVALID`. `official-live-blocked/` retains the real failure. Browser TLS checks were not disabled. The local verbatim-source recording is evidence of code reuse and behavior, not a claimed live-site recording.
2. Starting an independent Chromium with sandbox enabled for native reduced-motion/CDP verification **failed before startup** with `No usable sandbox`. No `--no-sandbox`, certificate bypass, credential or security change was added. The existing matchMedia-controlled test verifies SDK queue bypass/full text; native CSS media emulation is still unverified.
3. Independent review and exact-HEAD GitHub CI remain the sole integrator's release gates. This agent did not merge, deploy or close #214.

Upstream source/license, every reused effect and necessary adaptations are documented in `third_party/assistant-ui/streaming-text/README.md`. The official component only supports a single plain paragraph. Markdown adaptation ends the blue window at structural block boundaries; fenced code/diagrams/math/mention widgets keep their own rendering and receive the upstream caret afterward. These boundaries are explicit and should be reviewed by the integrator along with the visual recordings.
