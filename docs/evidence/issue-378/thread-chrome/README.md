# Thread chrome and question selector work

Production a6b54673 / LingxiOS3.8.12 already includes the official assistant-ui
0.15.31 scroll controller, static history avatars, bounded animation wrappers
and stable copy-text derivation. This change retains those implementations.

The viewport shell still subscribed to the complete message array and the full
product thread snapshot. Each body delta updated the shell, rebuilt its message
map and rescanned entrance state. The question-index selector also rebuilt every
historical question preview before comparing its serialized output. The official
MessageByIndex already has memoization; this is not a claim that every historical
message body was re-rendered.

The shell now selects loading/recovery/running flags from the existing store and
selects only message identity/order, receipts, first-message time and reply-branch
metadata from the official runtime. Body changes remain owned by the existing
message/part primitives. Complete semantic branch changes, receipts, prepend,
replacement and time-validity changes still invalidate their owning effects.
Question summaries use weak per-message caching; edits and attachments invalidate
without retaining unloaded histories. No text, authorization, cancellation,
part identity, auto-scroll controller or model configuration is changed.

Three focused tests cover identity retention and required invalidation. Web
TypeScript passed. The combined owning suite with the Visualize
startup change passed 10/10. A browser comparison uses the existing question-index
fixture and official e2e runner, production-mode Vite output, the same exact
locked assistant-ui packages and synthetic public messages on both sides. Its
render counters are injected only by the private build transform. Raw comparison
results and any resource/setup failures are recorded in the PR before merge;
no production/device frame-rate or population percentile is inferred from it.

Local environment preparation initially omitted sparse-checkout imports, then
exposed an incomplete old assistant-ui dependency tree. The current locked
packages and their dependency closure were prepared using registry bytes checked
against lock integrity, without changing project manifests or locks. A 2048MiB
comparison build exhausted V8 heap; that resource failure is retained separately
from source tests. None of those attempts is counted as a successful browser run.
