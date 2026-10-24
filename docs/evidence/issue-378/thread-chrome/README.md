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

## Bounded browser result

The final official Chromium cases passed on both sides (raw reports retained in the selected environment). Three samples each used the same80-message history,40 body updates
per sample and the same production-mode dependency closure. Both retained the
selection established during the active run and displayed all121 increments.

| Sample | Baseline shell renders | Candidate shell renders | Baseline replay ms | Candidate replay ms |
|---|---:|---:|---:|---:|
| 1 | 80 | 0 | 2889.8 | 3752.5 |
| 2 | 80 | 0 | 2951.2 | 3183.3 |
| 3 | 80 | 0 | 3133.1 | 2036.4 |

This confirms removal of shell render work, not an overall rendering-latency or
FPS win. Total replay timing did not show consistent improvement; long tasks
remain (6 baseline/10 candidate across these short samples). The reference-device
frame/paint budgets and production distribution therefore remain unmet evidence,
and #378 must stay open. The question-preview cache has focused getter/invalidation
coverage; its private build counter was not successfully instrumented on both
sides and is not used as a browser performance claim.

The first browser baseline lost its selection because the fixture selected text
before initiating a run. The pinned react-lexical0.2.11 FocusPlugin intentionally
focuses the composer on runStart; both sides showed that behavior. The final
scenario establishes the active run first and then selects historical text. No
product focus rule or selection assertion was weakened. An earlier candidate
read118/121 increments before its existing smooth queue caught up; the final
scenario explicitly waits at most2s for received running text to display and
retains exact121 equality. Final catch-up was0.2ms/0.1ms after sampling, not a
terminal-event latency measurement. Original failed logs remain local.

The 3072MiB comparison builds passed on both sides. Initial missing-dependency,
CLI usage and 2048MiB-heap failures remain local setup/resource records. No real
provider call or private production conversation was used.

## External delivery blocker

The product changes are locally committed. The first source push succeeded, but
the later fast-forward push could not read Git credentials. A read-only identity/
repository check then returned HTTP401 Bad credentials using the existing configured
identity. No alternate identity/route, PR creation, merge, image build or production
release was attempted after that failure. Existing GitHub authentication must be
restored and the current remote branch reconciled before normal CI and release.
Production remains accepted a6b54673 /3.8.12; neither issue is closed by this work.
