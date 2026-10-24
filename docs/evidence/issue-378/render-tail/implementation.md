# #378: source-backed static text and leaf-cache lifetime

Base: `11dd55d0f166e060369de323b7c1333447876f45`.

The current main already contains assistant-ui0.15.31, static history avatars,
the optional-metadata and marker-free mention fast paths, isolated thread-shell
subscriptions, and incremental word tokenization. This candidate keeps those
implementations and addresses two remaining local costs.

## Concrete changes

`StreamingText` previously called `take(words, count)` on every render, copying
all visible tokens. Its static prefix then sliced, scanned and joined those
tokens even though only128 words could have animation wrappers. Markdown leaves
now supply their original text and token UTF-16 start boundaries. Static ranges
slice that text at their two boundaries; only the animation window is copied
and mapped. The original upstream `clamp` retains `take`'s count normalization.
Standalone segments retain their existing mono styling and whitespace behavior.

The selected wrapped range, React keys, entry/color classes,128-word animation
budget, two-word blue tail, single caret and700ms completion settle are unchanged.
Selected text can continue receiving a plain suffix without moving its held
wrapped range. Source offsets include leading whitespace and remain correct
when a combining mark, surrogate, joined emoji or Hangul sequence arrives across
updates. The existing Markdown parser, rich renderers and official viewport
controller remain the owners of their behavior.

`createStreamingWordTokenizer` previously retained every leaf index it had ever
seen during that block's lifetime. A replacement or Markdown structure change
that removed leaves left their text and token arrays referenced by the cache.
The existing callable tokenizer now exposes a small `finishPass(leafCount)` hook;
the rehype adapter invokes it after a complete pass and truncates removed cache
entries. Surviving leaves retain their cached array and incremental token reuse.
An all-opaque replacement releases every prior text-leaf cache entry.

The tokenizer/cache implementation and its focused regressions were delegated
to `gpt-6.1-sol` with high reasoning effort. The lead integrated the source-text
render path. No independent review, production change, dependency change,
visualize resource-loading change or real student data was part of this work.

## Focused regressions and operation evidence

The new renderer operation test failed before implementation:
`1000 words, streaming=true: 1000 token reads` exceeded the existing animation
window plus four endpoint reads. The cache tests separately failed on removed
leaf reuse and all-opaque replacement reuse; the new offset test failed on a
missing start offset. These were actual pre-fix failures, not inferred results.

The final focused command used Node22.23.3 and the restored locked dependency
tree:

```sh
/workspace/.tools/node-v22.23.3-linux-x64/bin/node --import tsx --test src/components/assistant-ui/elements/streaming-text-budget.test.tsx src/components/assistant-ui/markdown-streaming-cache.test.tsx
node node_modules/@biomejs/biome/bin/biome lint src/components/assistant-ui/elements/streaming-text.tsx src/components/assistant-ui/elements/streaming-text-budget.test.tsx src/components/assistant-ui/markdown-streaming.tsx src/components/assistant-ui/markdown-streaming-cache.test.tsx
git diff --check
```

Results:12/12 tests passed; four-file Biome lint passed; whitespace check passed.
Coverage includes wrapper budgets and exact text, source-backed static Unicode
and whitespace, negative/NaN/fractional/oversized count normalization, cross-block
tail ownership, opaque code ownership, every UTF-16 append in the existing
Unicode samples, immutable prior tokens, processor recreation, reduced leaf
counts, zero-leaf replacement, and source-slice boundaries.

The operation test proxies numeric token-array reads while rendering the real
component with synthetic Chinese text. It also checks exact rendered text.

| Input words | Active stream token reads | Static token reads |
|---:|---:|---:|
|1,000|130|1|
|10,000|130|1|

The active count is128 animation tokens plus two static-range boundary reads.
The test keeps a bound of the animation budget plus four endpoint reads; no
frame, latency or acceptance threshold was relaxed. The pre-fix test stopped at
its first1,000-word failure; a10,000-word baseline sample was not run.

## Limits and remaining work

These counts cover renderer token-array traversal, not total update complexity.
The incremental tokenizer still copies `previous.words`' stable prefix into its
next array. Markdown parsing, string slicing/serialization, React text diffing,
layout, painting and official scrolling are unchanged. Each token now stores
one numeric source offset; releasing stale cache references is not proof of a
net heap reduction, and no heap benchmark is claimed.

The existing official browser budget scenario is owned by the integrating
thread; its environment and actual result belong in
`environment-and-browser.md`. The focused tests alone do not prove DOM selection
continuity, reference-device frame/paint budgets, removal of remaining long
tasks, production distributions or release readiness. Keep issue#378 open.
