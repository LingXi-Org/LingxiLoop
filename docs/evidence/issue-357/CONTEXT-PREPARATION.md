# #357: parallel authorized context preparation

Baseline: product `be301f2b25a7969af92674ada6f542ff0b90eec2`, formal LingxiOS 3.8.5.

The first stage removes a confirmed serialization defect in `createProductContext`. Knowledge search used to wait for roster, learning, Canvas and memory-scope reads, then visualization directory/state and actor/read-receipt work. Search only needs the already-authorized scope and channel history. It now starts at that dependency, while the other required branches run concurrently. The complete context still waits for every required branch.

Admission authorization remains before all preparation. Audience, current source permission, exclusions and source versions are reread; there is no cross-turn context or permission cache. Cancellation and unavailable-dependency classification are unchanged. Agent read receipts still use the existing transactional outbox. Model budgets, protocol, semantic-review policy and runtime package are unchanged.

## Owning verification

- A regression added before implementation held the roster query and required both local text/vector search requests to have started. The baseline failed with `0 !== 2` after a bounded wait.
- The modified real PostgreSQL/local HTTP test passed. Search began 251 ms after context preparation started, before the held roster was released. The context promise remained pending until all required data was available. The deliberately stalled search still respected its five-second timeout (measured assembled preparation: 5279 ms).
- Related current-source authorization, attachment, citation and durable-receipt integration: **15/15 passed**, no skipped cases. This includes cancellation propagation and rollback/replay of read receipts.
- Server typecheck and lint on both changed TypeScript files passed.

These timings are from a controlled local fixture, not a production first-token or browser-paint measurement. There is no user-facing UI change in this stage. The larger issue remains open pending the separately investigated evidence/tool round trips and actual first useful answer behavior; this preparation improvement alone does not establish that a long production wait is resolved.

## Timing interpretation

The existing runtime `input.loaded` diagnostic measures initial context duration. Provider `providerFirstContentMs` can include process text, so it is not equivalent to first useful answer. Public answer events can identify the first answer segment, but unavailable event timestamps or browser paint times must remain unknown. No missing historical timestamp is reconstructed from duration or sequence numbers.
