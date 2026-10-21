# Public progress and failure states (#261)

Written before implementation. Native public provider text must keep streaming
before tools and between results. Internal reasoning, prompts, raw arguments and
paths must never be used as substitute text.

- Before the first public provider chunk, the actual queued/leased state must
  have a factual textual explanation; no invented task result or elapsed time.
- Failed script/skill/visualization tools must not become generic “处理任务”.
- A completed save is storage evidence, not proof that a view was delivered.
- A saved visualization awaiting a final reference, terminal missing reference,
  and failed save must be distinct. A prior request's save proves nothing here.
- Real provider text must remain ordered with tools and visible before EOF.
- Status is derived only from public lifecycle and tool receipts. No internal
  model events, chain of thought, arbitrary exception text or file paths cross.

This changes server public projection and copy only. Client iframe startup and
geometry remain owned by the other workstream. No runtime version change.

## Independent review: failed delivery must not look pending

With a confirmed save and a current committed visualization reference, the
public runtime can report `delivery: failed`. The original projection called
both failed and pending delivery "waiting", hiding a confirmed failure.
Before changing this branch, add a narrow public-state regression: pending
remains waiting, failed explicitly means not delivered, not_observed/null stay
unconfirmed, and only delivered activates the existing reference. Use the real
public consumeAssistantMessage helper and synthetic receipts; no provider or
production call is needed. Preserve the original reproduction and failing diff
in the independent review handoff.
