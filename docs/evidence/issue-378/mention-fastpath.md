# #378: skip mention work when no mention marker exists

Base: `a6bfb179e6df5a694136c55df498ed3fa772f8cf`.

Marker-free historical messages and stream snapshots previously entered Markdown
masking and grapheme normalization. Visible scans normalized their masked body
twice. The change adds only early returns, without a cache, new parser, or changes
to matching, source offsets, roster identity, or admission rules.

`@`, `﹫` (U+FE6B), and `＠` (U+FF20) are the complete set of Unicode scalars
whose NFKC/lowercase form contains `@`. The test enumerates all 1,112,064 Unicode
scalars and exercises all three with fullwidth names, combining accents, and
original UTF-16 ranges. Both Node 24.19.0 and CI-aligned Node 22.23.3 report
Unicode 17.0 and pass this coverage.

Marker-free plain prose returns before AST parsing. Markdown containing `|`
retains the original GFM AST path because a member-ID table can project bare IDs
to Chinese names. After table/code/address masking, no remaining marker means
both prose-normalization passes can be skipped while retaining table results.

## Focused verification

The new zero-segmentation regression was run red before implementation (157
`Intl.Segmenter.segment` calls), then green. It covers prose, plain-text mode,
bare-ID tables, non-table pipes, and completely masked examples/addresses.

Run with `/workspace/.tools/node-v22.23.3-linux-x64/bin/node`:

```sh
node --import tsx --test src/lib/mentionPresentation.test.ts server/src/__tests__/mentions.test.ts
node node_modules/@biomejs/biome/bin/biome lint src/lib/mentions.ts src/lib/mentionPresentation.test.ts
git diff --check
```

Results: 17/17 tests passed; lint passed for both edited files; diff whitespace
check passed. Existing tests cover all/unknown/adjacent handles, Chinese prose,
duplicate aliases, rename history, code/quotes/links/email masking, normalized
offsets, and Chinese member-table display/copy. No full build or browser suite
was run for these isolated function changes.

## CPU microbenchmark

Node 22.23.3. Baseline and candidate were independently bundled from the same
worktree with existing esbuild; baseline source was read with `git show` at the
base above. Every input's before/after result was asserted deeply equal. CPU is
`process.cpuUsage()` user + system, median of five samples after eight warmup
input sets. Iterations adapt toward 100 CPU ms/sample, bounded to 20–50,000.
Values are CPU milliseconds per complete input set, not UI frame timings.

The shared paragraph, in JavaScript literal form, is:

```js
const paragraph = '## 学习记录\n\n先解释概念，再给出例子。Cafe\u0301 🙂 结果应保留原始文本。\n\n'
const history = Array.from({ length: 64 }, (_, i) => `第 ${i} 条记录\n${paragraph.repeat(8)}`)
const stream = paragraph.repeat(300)
const roster = ['nova', 'sage', 'milo', 'trace', 'scout', 'forge']
  .map(id => ({ id, name: id, kind: 'agent', presetKey: id }))
```

| Same input/function | UTF-16 units | Before CPU ms | After CPU ms | Iterations/sample before → after |
| --- | ---: | ---: | ---: | ---: |
| 64 history messages, `scanVisibleMentions` | 22,070 total | 84.35325 | 0.026724 | 20 → 3,059 |
| Stream snapshot, `scanVisibleMentions` | 12,600 | 42.79735 | 0.013251 | 20 → 9,804 |
| Stream snapshot, `scanMentions` | 12,600 | 25.20785 | 0.014851 | 20 → 8,000 |

The first benchmark's table/real-mention controls had substantial allocation/GC
variation. A narrow control follow-up used 100 warmup calls, five samples of
100 calls, alternating before/after order, and explicit GC before each sample:

| Boundary input, `scanVisibleMentions` | Before median CPU ms (range) | After median CPU ms (range) |
| --- | ---: | ---: |
| Bare-ID table: header plus 60 `sage` rows, 989 UTF-16 units | 10.08358 (9.542–12.206) | 8.63918 (8.141–12.191) |
| `paragraph.repeat(8) + '@sage 请核对'`, 345 UTF-16 units | 5.57088 (3.963–7.417) | 5.85569 (4.445–8.369) |

These overlapping control ranges do not establish an improvement or regression
for inputs that still need parsing/matching. The measured benefit is removal of
unnecessary work on marker-free inputs; this does not establish whole-page
smoothness, streaming frame budgets, browser performance, or release readiness.
