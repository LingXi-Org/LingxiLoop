# Stable substantive answer segments: product failure model

Written before the product implementation. Issue: #366. This document describes
synthetic regressions, not production measurements or acceptance.

The native runtime owns validated operations, sealed source identities, scope,
ordering, final source ranges and the atomic result/outbox commit. The product
must consume its public reader/reducer, reusing the selected upstream identity
semantics through that shared API; it must not implement another answer reducer.
The upstream selection and license/reuse map are a release prerequisite.

## Failures to reproduce

- A substantive segment A disappears or becomes a draft when a later tool,
  commentary, attempt or segment B appears. A remains answer content throughout
  A → held tool → commentary → another tool → B → final.
- The final message repeats A+B as a new text part, changing the DOM identity and
  replaying animation. Its accepted source ranges must retain A and B identities.
- A pending or failed explicit replacement retracts the accepted original. Only
  a valid native final collection activates replacement, atomically.
- An event from another run/request/fence, a replayed chunk, an out-of-order
  event, or an unsealed/incorrect hash source changes visible accepted text.
- Hydrating the final message before bounded events loses source boundaries.
  The native validated UTF-16 ranges must reconstruct canonical segment slices.
- Pagination or reconnect archives active answers as process text, duplicates
  the same segment, or promotes stale revisions over current answers.
- Identical text in different runs is merged by content similarity. Identities,
  never text, decide equality.
- Cancellation or failure hides already shown substantive text or reports a
  completed result. Status remains incomplete and the confirmed text remains.
- Process/tool activity enters copyable answer content, or public projection
  leaks arbitrary operation fields, private tool arguments or internal state.
- Citation offsets, resource references, delivery authorization or artifact
  rendering break when accepted body text is split at stable source boundaries.
- A v3 producer runs against an old reader, or old v1/v2 histories change meaning.
  The single runtime patch starts both compatible Web readers before Writers;
  release tooling preserves binding, lease, provenance and CAS checks.

## Owning checks

Product projection/transport tests emit reproducible `AgentRunSnapshot` frames
from native events plus an independently hydrated final history. Fixtures include
append, failed/successful explicit replacement, replay, stale scopes, cancellation,
and equal text in distinct runs. The browser owner consumes these frames through
the actual decoder/store/renderer and checks visible content and stable DOM keys.
No new provider request or production access is part of this test suite.

Frame artifact contract: `artifacts/react-delivery-366/frames.json`, with a
version, scenario list, runId, ordered `{ checkpoint, snapshot }` frames and an
independent `history` snapshot. Successful browser results must refer to the
exact source/test revision. Synthetic timings are not production latency claims.
