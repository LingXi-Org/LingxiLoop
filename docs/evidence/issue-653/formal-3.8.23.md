# Formal 3.8.23 integration and release gates

This supersedes the 3.8.22 dependency candidate while retaining its diagnostic
history. The formal package is associated with LingxiOS commit
`3783d0aaa57f747a33e29826054a8cfaf3fefd0d`, post-merge gate41654780600 and
publish41657661784. Product integration uses the registry archive:

```
https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.23/1928450a51cfc576a94f119696c53813a5ae6c50
sha512-a/j3KZYnHN4tmzImHuxAQED1j+By8R7D8Disa102dVNYBtzEsVizWCrhqmGn78AMBIEIVUimqBAZLdCQNegPgw==
```

The downloaded bytes independently match that integrity and the matching
root/server/generated scoped locks. The installed module is extracted from this
formal archive. The earlier local source-candidate archive is kept separately;
its different integrity is not accepted as this registry receipt.

The native SQL remains SHA256
`c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f`
(schema14/protocol11). Product startup uses its ordinary exact formal-package
assertions and the complete installed product61 migration inventory.

## Transition and deterministic product checks

The default reviewed production bridge is exact21→23 in one provenance CAS;
it never starts an intermediate22 Worker. The existing reviewed22→23 store path
remains available. A22 source plan must be chosen explicitly with
`runtimePatchPlan(read, paths, { sourceRuntime: '3.8.22' })`; its ID differs from
the21 source plan. Preflight never guesses or retries another source when the
chosen source does not match. Other sources and incomplete inventories fail.

All drain/maintenance, retained-work, exclusive-client, fencing,
uncertain-COMMIT observation and read-only target startup checks remain active.
No target DDL, seed, fresh install, product adoption or partial58/59/60 history
is accepted. The ordinary deployment entry defaults to the reviewed21 source;
an operator already on22 must prepare the explicit22 plan rather than reuse a21
intent. Source snapshots and pre-CAS recovery retain that same chosen source.

The isolated test bootstrap starts from an actual formal21/product61 source and
applies the direct21→23 CAS. Five owning cases cover this bridge; another five
retain22→23. Actual formal21 and formal22 archives separately retain the original
20→21 and21→22 qualifications. Both direct paths change one provenance row over
identical native14/protocol11 SQL and the exact complete product61 ledger.

The bridge and synthetic-diagnostic checks are recorded in the PR. Earlier
formal23 checks (39 owning cases, server182/admin10, types/lint/build) remain
historical evidence; the new direct bridge and stream lifecycle cases require
their own focused results and independent review.

## Formal-package real-provider gate

The original full product brief fixture was run against the formal23 installation
in a dedicated loopback PostgreSQL/Redis environment with recording IM. All
normal product authorization, ledger and delivery paths remain active. Raw text,
arguments and credentials remain private. No matched replay controls were used.

The first run completed with one model call and accepted delivery. The second
run failed after one model call; the planned third run was stopped. The failure
had native-call fragments but no normal stream ending. The SDK reported
provider/unknown, `streamCompleted=false`. Its finalized callback/ACK diagnostics
do not yet establish the underlying transport or callback cause. This is a new
failed release gate, not proof that the earlier empty-native-call symptom has
returned. No retries, parsing fallback or protocol relaxation is added here.

The successful3/3 source-candidate experiment is retained as separate evidence;
it cannot replace this formal-package failure. Do not merge/release this candidate
until the failure is diagnosed and real-provider qualification passes.

## Integration handoff

The designated sole integrator must confirm the actual production source,
matching formal archive/plan receipt and single-writer handoff before any merge
or rollout. A fresh plan intent is bound to its chosen source and target; no
runtime-source fallback is introduced. Production host state and health remain
unverified here. No production merge, configuration change, provenance write or
rollout was performed. The real-provider gate stays blocked until its incomplete
stream is explained and requalification is separately authorized and passes.

See [synthetic stream diagnosis](stream-failure-synthetic.md) for the precise
limits of the retained evidence. No new paid model requests were made for that
follow-up diagnosis or bridge validation.

### Bridge follow-up validation

The direct bridge follow-up passed27 deployment/owner/bootstrap contracts,
7 wire-observer units,45 cases across10 owning integration files and the updated
server183-case suite; server types/lint also passed. The actual fresh local DB
bootstrap separately recorded `actual-formal21-to23-product61-cas`, `updated:1`.
A second run recorded reuse of installed23 with no source preparation/CAS, then
read-only startup verification. Reuse is not counted as another upgrade.
