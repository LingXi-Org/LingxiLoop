# Issue 247: skill delivery failure model

Implementation base: `492bba8732a970a2ebf60f3c203a6e9cfb6173cc`.
This model precedes product implementation and owning regression tests.

## Contract

An authoring skill creates a durable delivery obligation only after explicit native
activation or an authorized transactional save/chart/diagram action. Loading the
skill, ordinary code, reading references, exporting, authorization, and verification
do not activate it. The product calls the public transactional activation hook,
rejects its absence explicitly, and lets the native action transaction commit or
roll back both activation and the document write.

Delivery requires an actual candidate reference to an authorized saved document
whose tenant, conversation, run, principal, agent, and request version match the
current obligation. The checker reads the stored HTML through its borrowed native
transaction, recomputes the source hash, and applies the fragment admission guard.
That readback establishes saved content integrity and authorization. It does not
claim model readback, browser rendering, provider quality, or numerical correctness.

## Failure cases and owning regressions

| Boundary | Failure | Expected observable result | Owning regression |
| --- | --- | --- | --- |
| Activation | Host forwards extra skill-index keys to the exact native activation parser | Pass exactly name/version/hash; never description/actions/delivery | All three authoring hook-contract tests |
| Activation | Runtime lacks the public host hook | Explicit unavailable error before save; no silent opt-out | Transactional authoring action test |
| Activation | Invalid arguments, no effect, throw, abort, or denied current authorization | No new activation or document commit; separately committed explicit activation stays pending | Native worker/action transaction test |
| Inert paths | Code, skill load, reference read, export, authorize, or checker read | No new delivery obligation | Existing generation/export worker test plus checker test |
| Repair | Native pending decisions are inconclusive and do not enter the runtime failed-check repair path | A separate public product failed verification record drives repair; native decision remains pending and final guard stays closed | First missing-reference native worker regression |
| Candidate | Activated run returns no reference, code-wrapped reference, or unavailable/pending reference | Obligation remains unsatisfied with an actionable repair hint | Scoped final checker test |
| Provenance | Foreign tenant/channel/principal/agent/run or an older request version | No delivered decision | Database-backed final checker test |
| Provenance | Same HTML is saved in a later request on the same run | Persist the new trusted request version; the old request cannot satisfy the new one | Document save/readback test |
| Integrity | Stored hash differs, fragment is invalid, or document is missing | No delivered decision | Database-backed final checker test |
| Authorization | Grant revoked, membership changed, or a referenced document is no longer allowed | Fresh final transaction rejects delivery | Database-backed final checker test |
| Partial result | Some actual references are invalid or unauthorized | No whole-obligation delivery success | Scoped final checker test |
| Honest failure | A native unsupported/failed resolution is mistaken for satisfied authoring | Product verification remains inconclusive so final envelope carries a real gap/partial outcome | Unavailable-contract decision regression |
| Honest failure | Model merely claims unsupported/failed, a specialized tool rejects input, or export reaches a size cap | Do not manufacture a terminal successful resolution; native repair/failure path remains authoritative | Decision boundary test |
| Lifecycle | Waiting, cancellation, steer/request change, or partial action failure | Preserve native lifecycle semantics; do not resolve an obligation from stale evidence | Existing native lifecycle tests plus product request-version test |
| Transaction scope | Final resolver/checker reacquires a global pool connection with pool.max=1 | All database-backed resolution and final readback use the borrowed queryable | Single-connection regression |
| Migration | Runtime 3.6 package changes the historical migration 0047 target | Historical 0047 remains schema 13/runtime 3.5.8 through migrator code | Fresh replay and 0049-to-0050 migration test |
| Migration | Product 0050 succeeds but native 13-to-14 upgrade fails, or vice versa | Native upgrade, document provenance column, and product ledger roll back together | Transaction failure migration test |
| Migration | Historical SQL is edited or a different source schema is supplied | Existing checksum/source checks reject it; all 0001-0049 bytes remain unchanged | Migration checksum/source validation |

## Verification limits

Focused scripted-provider and PostgreSQL regressions are the implementation gate.
Browser/provider matrices remain distinct evidence; they cannot be inferred from a
saved reference or checker readback. Formal 3.6.0 package and lock changes and new
runtime execution wait for the release owner's publication confirmation. No
production or shared dependency tree is changed by this branch.
