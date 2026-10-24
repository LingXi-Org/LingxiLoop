# #378 bounded browser CPU / heap diagnosis

A real remaining main-thread hotspot is visible in both tested builds:
`activityAnnotation` and `answerSegment` repeatedly take the optional-metadata
schema failure path from message/part selectors. The CPU profile reaches these
helpers through `nativeText` / `useMessageCopyText` and assistant-ui subscriber
notifications. The emitted function bodies map directly to
`src/lib/runActivity.ts:63` and `src/lib/answerSegment.ts:12`. Valid ordinary text
in this fixture has no annotation/segment metadata; source inspection explains
why those calls parse undefined and create Zod errors. Argument values are not
recorded by the CPU profiler, so this last connection is a source/input inference.

The candidate retains substantial long tasks; the sampling evidence
must not be interpreted as user-device FPS. The exact measurements below are
from the existing headless Chromium153 Linux process at1100×900/DPR1. No user
production conversation, provider, DB, browser flag or forced GC was used.

## Source and one-sample protocol

Baseline d3227695c7ae1bb89356dc9135821a1a276ae65d contains A/B/C. Candidate
033fa2dd6c087360bdf57d0ff805f645ff9b4f6b contains D/E/F/G too. Git comparison of
src, package/lock and the pinned streaming helper against main55f62548 is empty.
`preflight.json` and `FILES.json` retain exact fixture/lock/build hashes.

The first baseline build requested hidden maps for source attribution and hit
its2048MiB V8 heap limit at chunk rendering (exit134); this is a build-process
failure, not browser-memory evidence. Its log remains. Root authorized exactly
one new no-map build per source with the same Node22/2048MiB bound; both passed
55.58s/49.25s. Large output is isolated under/workspace/diagnose-378-build.

One official tester-army/@e2e-dev/web case ran on each build, serially, zero
retries. Both completed (59.06s /48.41s). The unchanged common diagnostic input
uses actual AssistantTransport append-text decoding, harness publication,
applyRunSnapshot/canonical store and full ConversationMessage/Markdown/avatar.
64 history messages expand to128 midstream; a20s requested stream is followed by
three cancel/switch/restore cycles, component unmount, and the existing store
reset. This is a synthetic component lifecycle / decoder-store replay, not full
ChatTransport app navigation/reconnect or server lifecycle qualification.

Important input limitation: the40ms synthetic producer runs on the same page
main thread. Stalls delayed it, so the same programme emitted214/207 total updates
(and160/154 at the20s checkpoint), rather than an identical fixed network event
trace. These counts and timing-origin drift are retained. This pair localizes
hot work and cleanup; it does not establish a causal percent speedup for equal
work or real provider/network throughput. No sample was repeated to improve it.

All interactions used the official engine. Supplemental ws CDP attached only
to the exact synthetic page URL returned by browser.url; target IDs, provenance
and checkpoints are in results/<side>/checkpoints.json. CPU sampling1ms,
allocation sampling128KiB and identical JS longtask/rAF/500ms DOM probes were
used on both sides. Production React component/Markdown render counts are not
exposed; the React hook records root commits and fiber-unmount callbacks only.
No fiber/root objects were saved by the hook. Mutation counts are not render calls.

## Actual observations

| Measurement | d322 baseline | A–G candidate |
| --- | ---: | ---: |
| CDP profiled window |55.41s|44.93s|
| ScriptDuration delta |35.07s|26.44s|
| LayoutDuration delta |1.46s|1.13s|
| metadata helper CPU subtrees |14.842s /26.79% sampled wall|10.270s /22.86% sampled wall|
| viewport geometry CPU subtrees |6.936s|6.108s|
| identified BotEngine method subtrees |0.136s|0.133s|
| sampled GC self time |3.245s|2.127s|
| long tasks |279;38,762ms total;2337ms max|228;33,228ms total;932ms max|
| sampled rAF intervals |p50 16.7ms;p95 249.9ms;max2683.3ms|p50 16.7ms;p95 200ms;max950ms|
| root commits / fiber-unmount callbacks |1160 /183,531|954 /184,261|
| measured JS probe callback time |267.3ms|230.4ms|

CPU categories are inclusive call subtrees and can overlap; they are not summed
as exclusive shares. GC is directly represented by CPU samples named
`(garbage collector)`, but not every collection is necessarily sampled. Minified
positions are mapped by matching emitted function bodies, without source maps.
`source-frame-map.json` / `metadata-cost.json` and raw .cpuprofile files preserve
the evidence. The identified BotEngine methods exclude React reconciliation,
CSS/compositor/paint cost; this does not establish that all avatar/animation cost
is0.13s or that all animation is free. It does show the sampled geometry engine
is not the dominant scripting stack in this case. Initial idle1s cost~0.04s of
script despite24–26 root commits; active metadata work is a stronger first target.
The requested producer itself, CPU/allocation profiler overhead and browser
harness overhead are not eliminated. No unprofiled control run was added.

## Heap and cleanup

CDP JS heap used at checkpoints, MiB:

| Phase | Baseline | Candidate |
| --- | ---: | ---: |
| mounted64 |39.0|39.5|
| largest measured checkpoint |242.1|234.3|
| component unmounted |118.4|120.3|
| existing store reset +3s |118.5|120.3|

There are clear inter-checkpoint drops and sampled natural GC during the active
run. There is no recorded forced collection after reset, no complete heap
snapshot/retaining-path graph, and no direct page/process RSS measurement. A
remaining118–120MiB used heap after3s cannot be called a leak. The allocation
sample at stop contains19.94/14.41MiB of sampled estimated allocations, mainly
React/assistant-ui runtime stacks; it is not the total heap or a proof that those
objects remain reachable after a subsequent GC.

After unmount both builds reached13 DOM elements, zero Markdown/word/avatar/SVG
nodes, zero active animations, zero counted pending rAF and timeouts, zero
synthetic producers/active streams, and no callback-counter growth after settle.
The actual global conversation store deliberately still held2 rooms ×129
messages, around22.5k/22.3k text characters. The product reset removed both room
references, and fixture source-record references were also cleared. This directly
observes the cache owner and its reset; it does not assign it a retained byte
size or demonstrate unbounded growth from only two rooms.

Two interval IDs were present at initial mount and remained two after cleanup,
without growth across six switches. The diagnostic's periodic sampler uses the
captured original interval function and is excluded from that count. Creation
stacks for these two IDs were not captured, so their exact owner is unresolved;
no interval leak is claimed. Both builds had no page errors or unexpected blocked
requests. No artifact/sandbox-owner retention was covered by this scenario.

## Narrow next action

First remove optional annotation/segment schema work only when the extracted
field is exactly undefined; keep all present/malformed/null values on the current
schema path, including segment coordinates/length validation. This is a source
recommendation supported by current profiles, not a measured fix. No cache,
retention policy, global animation or renderer-architecture rewrite is justified
by this one pair. A code change, targeted negative tests and one necessary
modified-candidate profile require a separately frozen source and root window.

Raw evidence is under results/{baseline,candidate}; SUMMARY.json is derived from
those immutable records. No product file, release, merge or deployment was changed
by this diagnosis. All own runners/static servers exited and ports5195/5196 were
confirmed free when the window was released; Chrome/CDP9337 was left intact.
