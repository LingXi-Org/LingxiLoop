# #366: stable ReAct delivery and recovery failure model

This inventory precedes the acceptance implementation. It covers only synthetic
local fixtures. Product baseline: `0ec3bc0aeb2473f02a890b579e850055746de4c7`;
runtime baseline: formally published 3.8.6. It does not certify production.

## Ownership and public contract

The runtime owns validated public operations, segment identities, sealing,
checkpoint recovery and final atomic commitment. The product owns authorized
projection, SSE/history reconciliation and actual message rendering. Acceptance
uses these public paths; it must not recreate their state machine in a test-only
adapter or read private production receipts.

The proposed producer is a new protocol version, not additional fields silently
accepted by the previous producer. Before implementing exact-wire fixtures,
freeze the exported operation/segment/source-reference types with the runtime
and product owners. Fields mentioned below describe invariants, not permission
for a test to forge a trusted seal or final receipt.

## Required failures and observable outcomes

| Boundary | Failure to prevent | Required observation |
| --- | --- | --- |
| Useful answer A, then a held tool | A is demoted, erased, or hidden as process | A remains in the ordinary answer while the real local tool is held |
| Commentary and second tool | Process text replaces A or is appended as substantive answer | A remains; commentary uses its actual process presentation |
| Answer B and final | Final replays A/B or duplicates complete text | B is appended once; final references the existing ordered segments |
| `answer: null` | Empty, unsealed or unrelated text passes as completion | Only a valid nonempty active sealed set for the same request can finalize |
| Replacement begins | Old answer disappears while a new draft is incomplete | Old committed segments remain visible until replacement commitment |
| Replacement fails/cancels | Failed draft removes the original | Original remains; truthful failure/cancel is retained |
| Replacement succeeds | A mixture of old and new bodies is published | One atomic revision replaces exactly the nominated active segment set |
| Cross-run/request replacement | A model or replay removes another answer | Reject without changing either answer |
| SSE order, duplicate pages, reconnect | Duplicate chunks or stale snapshots erase newer text | Stable identity, sequence and revision govern merge; histories converge |
| Equal text in two runs | Text-based deduplication merges independent answers | Two distinct messages remain, regardless of identical text |
| Recovery with a new fence | Old legitimate sealed text is lost, or old drafts become authoritative | Reuse valid sealed segments only; reject old-fence new writes |
| Unknown side effect | Recovery repeats a write whose outcome is uncertain | Reconcile the existing idempotency identity; no second dispatch |
| Cancel at each boundary | Sealed text or a pending tool permits fresh dispatch | Cancellation wins before any subsequent dispatch or success commitment |
| Final assembled body | Only the last segment receives citation/artifact checks | Every source/reference/visualization obligation checks the assembled body |
| Missing visualization | Early useful text masks missing deliverable | Keep delivered text, but preserve pending/partial/failed outcome |
| Hidden or unauthorized data | Internal reasoning or tool payload reaches ordinary text/artifacts | Synthetic private-data canaries never appear in SSE, DOM or saved evidence |
| Legacy binding | New behavior silently resumes an incompatible old run | Drain or use its pinned implementation; do not reset budgets or bypass binding |

## Test ordering

1. Establish the failing boundary with a local scripted HTTP provider and the
   published runtime driver. Use explicit gates, not timing sleeps, to prove A
   exists before releasing the first tool and remains through the second tool.
2. Exercise durable control-plane identity/fence/idempotency paths separately
   where required. Never make a successful effect by directly inserting its
   expected final row. Recovery uses the same work and intent identity.
3. Record actual product `AgentRunSnapshot` frames and an independently loaded
   historical snapshot. Replay them through the real transport decoder, store
   reconciliation, assistant-ui message rendering and RunActivity components.
4. Official `@e2e-dev/web` checks both desktop and narrow layout, reconnect and
   history convergence. Record each failed attempt; no automatic provider rerun.
5. Run only affected checks and exact-candidate CI. A browser-only simulation is
   not evidence of runtime sealing, authorization or durable side-effect safety.

## Evidence rules

- Preserve source commit, installed formal package version/integrity, scenario,
  run-local identities, event timestamps, final envelope and test result. Public
  files contain synthetic data only; never publish production IDs or raw traces.
- Name a measured timestamp by its real origin. Provider content arrival,
  durable event recording, SSE observation and browser paint are different
  measurements. Missing historical fields remain unknown.
- An ordinary question must produce one generation with zero semantic judges.
  Test with an authorized enabled knowledge source and count local retrieval so
  zero RAG is meaningful. Do not impose a low mechanical cap on genuine tasks.
- The real-provider visualization scenario needs root's specific approval after
  the implementation is frozen. It must deliver useful explanation before the
  resource operation, and then save, authorize and interact with the real view.
- Preserve the existing independent arithmetic PASS and prior visualization
  protocol/qualification failures. They do not become successful measurements of
  this new architecture merely because its code or synthetic tests pass.
