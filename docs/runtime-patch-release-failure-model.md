# Same-schema runtime patch release failure model

Recorded before implementation. No production data or operation is part of this
development change. Native14/product54 patch publication must fail closed when:

1. Source/target package revisions are not exact forward patches of the same
   major/minor, native bytes/protocol/capabilities or any product migration differ.
   Existing historical profiles retain their original exact versions.
2. The executing package/lock or sealed target differs; startup must never stamp
   provenance. Empty database initialization may stamp the current package only
   after applying the complete reviewed history during that same explicit install.
   Compare the actual module against both exact manifests and both lock entries;
   a partial existing history must use its historical package before the CAS.
3. Installation/source CAS, full inventory, actual native schema or table presence
   differ. The maintenance transaction must issue no DDL, seed or business write;
   the only UPDATE changes runtime_version and installed_at on one exact row.
4. Any live lease/attempt/capture/outbox or prepared transaction exists, visibility
   is incomplete, or an unfinished conversation work item already has a runtime
   binding/checkpoint. Include waiting, future queued and expired leased work,
   all request versions and cancellation requests. Return counts only.
5. A writer races the last check: lock installation, inventory and owning native
   work/step/lease/outbox tables in the CAS transaction; keep timeouts bounded.
6. Image preparation, source config, immutable layers, all four identities or
   initial target identity differ. Reuse existing image/config guards and the
   two zero barriers; stop both Workers and Webs before the single CAS operation.
7. CAS fails or its outcome is unknown: never replay it. Known unchanged source
   may use an explicitly verified restoration; committed target is fix-forward.
   No legacy migration/seed entrypoint is called by the patch branch.
8. Regression tests must exercise actual PostgreSQL CAS rollback, replay refusal,
   historical/current startup separation, empty install, bound waiting/queued
   work and host state-machine order/failure classification. Synthetic identifiers
   and local disposable databases only.

The new plan format is `runtime-patch-host-release/v1`. It reuses the existing
sealed source acceptance, source/target image audits, full configuration proof,
online preparation, four-writer drain and bounded natural lease wait. It invokes
`applyPublishedRuntimePatch` in the audited target image, never `migrate-bin`.
Only a forward patch in the reviewed 3.8 native14 family with an identical full54
inventory and protocol/capabilities is eligible; eligibility does not replace an
exact formal package lock, successful candidate CI or immutable image audit.

Known failures before CAS can use the existing `host-release-image-recovery.mjs`
entrypoint with the sealed plan, exact failed receipt hash and original audits.
The adapter rechecks saved native operations, full configuration, source DB
provenance and all container identities before restoring source Webs then Workers.
It refuses committed target provenance, uncertain operations and replayed recovery.
After CAS the release is fix-forward only. An uncertain operation is reconciled
read-only; this change adds no automatic retry or blind continuation.
