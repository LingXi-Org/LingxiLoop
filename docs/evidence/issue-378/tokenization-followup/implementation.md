# #378: immutable append snapshots and stable Markdown context

Base: `2cb8961a`, after PR427's source-backed static ranges and leaf-cache cleanup.
Branch: `perf/378-tokenization-followup`. This is a separate increment and does
not replace the previous evidence or claim complete #378 acceptance.

## Tokenizer: remove explicit stable-prefix copies

The incremental tokenizer already reparsed only the final word, but assembled
every next result with `previous.words.slice(0, -1)` followed by array spread.
One1,000-word append therefore read/copied999 stable references twice. Repeating
this on each update scales with the full received paragraph even though the
renderer only animates128 words.

The cache now owns one append-only stable-word array. A read-only snapshot
captures its visible length and an independent final word. Newly finalized
words append to that backing array; a prior snapshot uses its own final word
and never exposes newly appended indexes. It supports the renderer's existing
`length`, `at` and `slice` operations; ordinary standalone token arrays also
satisfy that interface. There is no parent-snapshot chain, token renumbering or
animation-key change. Replacements, incompatible segmentation modes and split
surrogate fallback start a fresh backing array. The previous leaf-cache
truncation remains in place.

The first instrumentation attempt used Node's `mock.method(Array.prototype, …)`,
which rejects array targets and failed before reaching product behavior. The
corrected synchronous instrumentation restores both array methods in `finally`.
The actual pre-fix regression then failed with:
`1000 stable words: 1998 prefix token copies/iterations` (`1998 !== 0`).

After the change, the same new test observes:

| Existing words | Application-level prefix slice/spread accesses during append |
|---:|---:|
|1,000|0|
|10,000|0|

The instrumentation counts the explicit `Array.slice` and array iteration paths
whose first token belongs to the retained prefix. It is not an allocator,
engine-capacity, total-CPU or heap measurement. The pre-fix run stopped at the
first1,000-word failure; no10,000-word baseline run is claimed.

The owning regressions retain five complete snapshots beginning with200 Chinese
characters and a Latin tail, then append further words,140 Chinese characters,
combining marks, joined emoji and Hangul, replace the text, and remove the cache
entry. Every retained snapshot's complete slice still equals its original
reference tokens. Original indexes, the127/128 animation boundary, negative and
out-of-range access, range slices and exact real-component rendered text remain
correct. Existing Unicode-by-UTF-16 append, stale-leaf release, opaque content,
wrapper budget and raw-text boundary cases are also affected and were rerun.

## Markdown: stop no-op context invalidation

Without citations, each changed `text` previously created a fresh empty blocks
array, then a fresh empty offsets array and a new `CitationBlocks` Provider
value. This invalidated its completed-block consumers even though citation
inputs were unchanged; the nested `CitedBlock` memo was the later boundary.

The no-citation branch now has no parsed block list and reuses a shared empty
offsets array. Actual citation parsing, raw-source offsets and all semantic
inputs remain unchanged. It continues using the installed official parser,
wrapper smoothing and tail-bounded incomplete-Markdown repair. No custom
`parseMarkdownIntoBlocksFn` is introduced: that prop would disable the wrapper's
current tail-remend path.

This implementation and its regression were delegated to `gpt-6.1-sol` with high
reasoning effort. A narrow hook harness executes the real `MarkdownText` body
with persistent hook slots and inspects its returned Provider value. The new
regression failed before implementation with20 identity changes for20 plain
body appends; after implementation it records0. Citation append/removal, joined
text-part and split offsets, claims, mentions, inline mode, agent mode and
reduced motion still invalidate the relevant value. This is Provider identity
evidence, not an observed browser-render or notification count.

## Focused verification and limits

CI-aligned Node22.23.3 was used with the existing locked dependencies. Results:

- Tokenizer/renderer owning files:14/14 tests passed.
- New Markdown Provider regression:1/1 passed.
- Six changed source/test files: Biome lint passed; diff whitespace check passed.

Commands:

```sh
/workspace/.tools/node-v22.23.3-linux-x64/bin/node --import tsx --test src/components/assistant-ui/elements/streaming-text-budget.test.tsx src/components/assistant-ui/markdown-streaming-cache.test.tsx
/workspace/.tools/node-v22.23.3-linux-x64/bin/node --experimental-test-module-mocks --import tsx --test src/components/assistant-ui/markdown-text-context.test.tsx
node node_modules/@biomejs/biome/bin/biome lint src/components/assistant-ui/elements/streaming-text.tsx src/components/assistant-ui/elements/streaming-text-budget.test.tsx src/components/assistant-ui/markdown-streaming.tsx src/components/assistant-ui/markdown-streaming-cache.test.tsx src/components/assistant-ui/markdown-text.tsx src/components/assistant-ui/markdown-text-context.test.tsx
git diff --check
```

The old suite was rerun only where the token collection contract changed; no
broader test matrix or independent review was added. Final full build and the
one existing official browser budget scenario are owned by the integrating
thread and recorded separately, including any observed long tasks.

Remaining full-text work includes append-prefix validation with `startsWith`,
the official Markdown/block parser, the extra source-coordinate block parse
when citations exist, and React/string/DOM/layout/paint work. A long unfinished
word may still require substantial final-word segmentation. Engine array
capacity growth is unmeasured. The local counters do not attribute browser work
in long conversations, prove a net heap reduction or establish end-to-end frame
budgets. The single candidate budget replay reported no long tasks; it does not
cover the full long-conversation flow. A same-origin long-conversation CPU trace
is still needed to attribute parser, reconciliation and layout costs before
another targeted change. Further parser or reconciliation changes also need a
correctness-preserving official integration path; this increment does not invent
one. Keep issue#378 open.
