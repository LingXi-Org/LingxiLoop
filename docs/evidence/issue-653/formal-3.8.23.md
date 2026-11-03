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

Only the reviewed exact22→23 pair is added to the existing runtime provenance
CAS. All existing drain/maintenance, retained-work, exclusive-client, fencing,
uncertain-COMMIT observation and read-only target startup checks remain active.
No target DDL, seed, fresh install, product adoption, partial58/59/60 history or
unreviewed21→23 skip is accepted.

The isolated test bootstrap starts from an actual formal22/product61 source and
applies the ordinary22→23 CAS. Actual formal21 and formal22 archives separately
run their original20→21 and21→22 owning qualifications. This does not use the
source-candidate startup adapter from the earlier experiment.

Local checks passed:26 deployment/CI-owner/bootstrap contracts;39 cases across
9 owning integration files (three5-case CAS qualifications, shared ledger,
public-text delayed ACK/seal rejection, authorized HTTP diagnostics,15 recovery
cases, native authorization and provider pricing); server182/182; admin10/10;
server typecheck/lint; admin build/lint; web typecheck. Final candidate CI and
independent review are recorded in the PR.

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

The public main manifest was still pinned to3.8.21 when this integration was
prepared. That is not proof of the deployed database version. The new plan
requires confirmed installed22/product61 and refuses21→23. The designated sole
integrator must establish the actual production source and a reviewed version
handoff before merging or deploying. Production host single-writer status and
health/configuration verification remain separate release gates. No production
merge, configuration change, provenance write or rollout was performed here.
