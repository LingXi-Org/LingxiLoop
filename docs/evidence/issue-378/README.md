# #378 streaming rendering performance

Baseline: `9b2cc3fed2e75b36069b7001c1418084db956201`, branch
`perf/378-streaming-render`. Synthetic public text only; no provider calls or
private conversations. Numerical issue budgets are targets, not measurements.

## Failure model and implementation boundaries

1. `MessageTextPart` constructs a new mention target array for each text update,
   invalidating Markdown plugin and completed-block memoization. Stabilize by
   actual membership/participant identity; membership and renamed participants
   must still invalidate the rendering.
2. The attributed upstream word renderer creates two spans for every Chinese
   character, including settled prefixes. Bound the animation tail while keeping
   the upstream entry/color/caret implementation, exact text, graphemes and
   Markdown structure. Selection/focus and pending color settlement must survive
   cleanup; reduced motion and interruption must reveal all received text.
3. Every snapshot traverses/sorts/groups history and parses the already validated
   wire object again. Preserve external validation, cumulative bounds, ordering,
   current run/fence/request identity and canonical receipts. Only proven text
   changes may use the incremental path; structural/semantic changes use the
   existing merge.
4. Conversation projections and per-part presentation repeat work; reuse results
   using explicit input identity without caching across semantic changes. Closed
   trace details must not run a clock. Retain the single assistant-ui scroll
   controller, authorization and visualization instance identities.

Record failing checks before changes, then affected checks. Pure render/CPU
samples establish node count and processing costs, not browser FPS, paint or
user-device performance. Production-build and official browser replay require
the integrator's shared browser slot. Preserve normal tail highlight; do not
hide content or errors to improve metrics.

## Coordination and pending verification

#373 owns public theme, ConversationThread, composer and interaction work.
#378 owns Markdown/streaming text, and coordinates any shared message/runtime
files before editing. No shared dependencies are installed or mutated here.
The requested formal react-streamdown 0.3.14 dependency upgrade remains separate
until the integrator provides its dependency preparation boundary.

Rollback uses compatible source/lock commits; no durable schema changes.

## B/C first bounded candidate (work in progress)

Current changes stabilize `mentionTargets` across text-only updates and cap
animation wrappers at 128 tokens across the original text-part's blocks. The
official two-token blue tail and caret are unchanged. Completed tails retain
700ms color exit, then become static text. A selected leaf defers consolidation
and shows new text without additional wrappers until selection leaves. Unicode
combining marks, joined emoji and Hangul clusters use `Intl.Segmenter`.

Pure owning red: 0/2 on the original component (1,000 tokens produced 1,000
word wrappers; `animate=false` still produced per-token wrappers). Current combined owning tests: 17/17 (five budget/Unicode/block cases and twelve
existing Markdown cases), recorded in `bc-tests.log`. One web typecheck passed
before the last pure test/tokenizer additions; final type checks remain pending.
Source lint passed eight changed implementation/test/fixture files. No browser
run was consumed.

The opt-in official-engine `e2e/web/streaming-budget.e2e.ts` uses the existing
real renderer fixture to check 10k Chinese text, selection during append,
completion and removal of settled wrappers. It is prepared, **not run**.

### Reproducible structural/SSR measurement

Node 22.23.3, existing shared dependencies, React development SSR, presegmented
synthetic text, one warm-up plus three measured samples. These measurements do
not include Markdown parsing, browser layout/paint, input latency or the model.
Baseline is the exact component at the fixed base, temporarily extracted into
its original module directory so JSX/import resolution is identical; the file
was removed afterward. Two initial harness attempts failed JSX resolution and
are excluded, not counted as successful samples.

```sh
git show 9b2cc3fed2e75b36069b7001c1418084db956201:src/components/assistant-ui/elements/streaming-text.tsx > src/components/assistant-ui/elements/streaming-text.baseline.tmp.tsx
node --import tsx scripts/streaming-render-cost.tsx src/components/assistant-ui/elements/streaming-text.baseline.tmp.tsx
node --import tsx scripts/streaming-render-cost.tsx
```

| Synthetic size | Baseline word wrappers | Candidate word wrappers | Baseline HTML bytes | Candidate HTML bytes | SSR median, baseline / candidate |
| --- | ---: | ---: | ---: | ---: | --- |
| 1,000 chars | 1,000 | 128 | 232,271 | 32,583 | 71.08 / 8.61 ms |
| 10,000 chars | 10,000 | 128 | 2,320,271 | 59,583 | 198.78 / 10.17 ms |

Input hashes match in `ssr-baseline.json` / `ssr-candidate.json`; every render
checks complete exact text, two fresh words and one caret. Samples are noisy
local development CPU observations, not the issue's production-build targets.

## Dependency audit (read-only)

Official fixed source `af7466155560aa3ff364abf57e89c7209882ab0d` and npm metadata
confirm MIT `@assistant-ui/react-streamdown@0.3.14`, with
`@assistant-ui/react-markdown:^0.14.15` and `remend:^1.3.1` (prior ^1.3.0).
Peers remain React ^18/^19 and assistant-ui ^0.15.0. The matching markdown
0.14.15 has no dependency-range delta from installed 0.14.13. No tarball was
installed and no lock was changed by this audit. Formal dependency preparation,
full remend/render comparisons and all D–G store/layout work remain pending.
