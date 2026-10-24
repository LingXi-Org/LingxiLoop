# assistant-ui Streaming text integration (#214)

Source: https://github.com/assistant-ui/assistant-ui

Pinned commit: `736c07f59623ae571f1e969bb1c8b6f91f661fd0` (retrieved 2026-10-20).

- Component: [`packages/ui/src/components/react/assistant-ui/elements/streaming-text.tsx`](https://github.com/assistant-ui/assistant-ui/blob/736c07f59623ae571f1e969bb1c8b6f91f661fd0/packages/ui/src/components/react/assistant-ui/elements/streaming-text.tsx)
- Range helper: [`packages/ui/src/components/react/assistant-ui/utils/range.ts`](https://github.com/assistant-ui/assistant-ui/blob/736c07f59623ae571f1e969bb1c8b6f91f661fd0/packages/ui/src/components/react/assistant-ui/utils/range.ts)
- Live documentation: https://www.assistant-ui.com/elements/streaming-text
- Demo: `apps/docs/components/demo/elements/streaming-text.tsx` at the same commit (88ms word interval).
- License: MIT, Copyright (c) 2026 AgentbaseAI Inc.; full original license in `LICENSE`.

`upstream/` contains the complete, unmodified component and helper. The production component is `src/components/assistant-ui/elements/streaming-text.tsx`. It imports the original `clamp` helper, preserving `take`'s count normalization without copying the full token array; it does not depend on a floating registry or a new npm package. The local comparison fixture also renders the unmodified component directly. Package manifests and lockfiles are unchanged.

## Actual code reused

| Upstream implementation | Product integration |
| --- | --- |
| `useMemo`, count normalization, index keys, nested word spans | Preserved; optional pre-segmented tokens retain Markdown leaf whitespace. Only the animation window is sliced and mapped. |
| `streaming && shown.length - 1 - i < 2` | Preserved with the number of tokens in subsequent leaves added to the distance, so bold/link/inline-code boundaries share the same trailing window. |
| `fade-in animate-in fill-mode-both duration-500 motion-reduce:animate-none` | Actual upstream outer span/classes; disabled for historical content. |
| `transition-colors duration-700 motion-reduce:transition-none` and blue-500/dark blue-400 | Actual upstream inner span/classes; finished words retain their nodes and transition to inherited text color. |
| Conditional caret and its full `-mb-0.5 ml-0.5 inline-block h-4 w-0.5 animate-pulse rounded-full bg-blue-500 dark:bg-blue-400` classes | Actual upstream element, condition and classes; no glyph/pseudo-element caret or second animation implementation. |
| `streaming=false` clears freshness and removes caret | Driven by Streamdown's public smoothed `isAnimating` context and the real text-part status. |

## Necessary adaptations and upstream boundaries

The standalone upstream component splits on spaces, appends one space to every token, and renders a sized paragraph. Feeding whole Markdown or unspaced Chinese into it would change content/markup or tint an entire paragraph. The production copy therefore accepts lossless `tokens`, an inline root, leaf-tail distance and a caret switch. Everything that draws or animates a word/caret remains the upstream implementation. Instrumentation attributes make browser assertions auditable.

`markdown-streaming.tsx` is a rehype/text adapter after the existing sanitization, mention and citation transforms. It splits CJK characters without inserting spaces; Latin words and every existing whitespace are preserved. It never reconstructs or reparses Markdown from the tokens. Inline code retains the existing code element. Fenced code, diagrams, math, images and mention widgets keep their own renderers and syntax colors; they are not converted into blue word spans. When one of those opaque nodes is the visual tail, an empty upstream segment supplies its caret immediately after the node. Prose resumes normal word highlighting afterward.

Each Markdown block retains its own tree and memoization. A text-part owner shares capped word-count summaries between committed blocks, including separate Markdown slices around a visualize reference. Only the tail blocks whose distance changes are notified; their cached trees are not reparsed. The upstream two-word window therefore spans inline and structural boundaries, with one caret for the whole text part. Leading whitespace is preserved as a token prefix and never consumes a word slot. The product's existing 32ms SDK smoothing, tail-bounded incomplete Markdown repair, code/table controls, safe-link policy, citations, mentions and non-text part routing remain intact.

A text-part identity key resets the SDK queue and decoration lifetime on message/part switches. Completed historical content does not mount animated word spans. Interrupted parts bypass the smooth queue; completion drains received text before settling. Reduced-motion CSS also suppresses the upstream caret pulse, which upstream's caret does not suppress itself. A data-theme compatibility selector maps the product's dark theme to upstream blue-400.

No provider, LingxiOS API, protocol, authorization, migration, canvas state or runtime dependency changed. Renderer fixtures do not claim live-provider coverage.

## #378 bounded animation adaptation

The attributed word/caret elements and their entry/color classes are retained.
Only the last 128 word tokens in the original text part receive animation
wrappers; earlier tokens become exact static text (standalone mono styling is
preserved). The shared block counter now carries a capped 128-token distance,
while the original blue window remains exactly two tokens and one caret.
Budget pressure may settle old wrappers early during a burst. Normal completion
keeps the 700ms color exit before removing wrappers. Existing selection holds
its current wrapped range and receives new text as plain text until selection
leaves, deferring nonessential DOM consolidation. This is a DOM-cost change,
not a second typing queue; the SDK remains the only reveal controller.

`scripts/streaming-render-cost.tsx` measures pure synthetic SSR node/serialization
cost. Browser selection, lifecycle and actual paint remain separate verification
gates; this measurement cannot establish user-device frame rates.

Markdown tokens also carry their original UTF-16 start boundaries. Static prefix
and suffix ranges slice the original text leaf directly, so rendering an update
does not copy or join all earlier tokens. Standalone segments keep their existing
mono styling and whitespace behavior. The block tokenizer drops cache entries
for text leaves removed by a later Markdown pass. These changes bound renderer
token reads and remove stale cache references; they do not establish a total
heap reduction or an end-to-end frame-time improvement.

## Reproduction

Use the repository's official `tester-army/e2e` / `@e2e-dev/web` engine:

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5196 --strictPort
E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5196 npm run test:e2e:web -- e2e/web/streaming-text.e2e.ts --video on --output artifacts/issue214/final
E2E_OFFICIAL_STREAMING=1 E2E_BASE_URL=https://www.assistant-ui.com npm run test:e2e:web -- e2e/web/streaming-text-official.e2e.ts --video on --output artifacts/issue214/official-live
```

The reference fixture (`?reference=1`) plays the same English input through the verbatim pinned component and the production `MarkdownText`; it does not stand in for a successful browser visit to the live website. This environment's live-site visit failed TLS validation (`ERR_CERT_AUTHORITY_INVALID`); validation was not disabled. Native reduced-motion/CDP setup also could not start sandboxed Chromium (`No usable sandbox`); no sandbox weakening was attempted. The existing matchMedia-controlled test checks queue bypass and full text, not native CSS media emulation. These residual visual acceptance items require a browser environment with normal TLS trust and sandbox support.
