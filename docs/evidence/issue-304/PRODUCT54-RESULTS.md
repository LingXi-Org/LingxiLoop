# Product54 local verification

Implementation baseline: `e2b4ec82`. Formal dependency remains LingxiOS3.8.2, native schema14; product migration54 adds only the nullable host presentation marker. All records are synthetic local fixtures. No private conversation, real index, GitHub API/push or production endpoint was accessed.

Migration54 SHA256: `f58aafed796cabcb481bd381b4df298024d5effd0a576dae5e9638430aed38e2`.

## Provenance and compatibility

- `receiveAgentRequest` and committed public handoff delivery use the actual published ingest receipt: only `deduplicated=false` can insert version1. Ordinary rebinding does not change the stored version, including NULL.
- Authorized context can inherit a marked runtime-owned parent/root generation within the same company, conversation and original principal. It cannot promote an existing unmarked binding.
- Routine scheduling uses its existing shared native/product transaction, so both native admission and versioned binding commit or roll back together.
- The other `recordSentMessage` ingress is agent-authored without a trusted `causedBy`. Formal3.8.2 classifies it as `agent_message` with no target runs; it is history synchronization and does not need a new-run marker.
- The product read path fetches the persisted marker using the complete native identity before consuming events. The native memory allowlist is unchanged; marked activity gets process purpose, unmarked rich activity remains unknown and visible. Explicit results remain explicit results.
- A callback loss after native IM admission, or a concurrent unmarked context binding, can leave a new run NULL. Retrying a deduplicated receipt does not fabricate proof. Such runs and descendants of unmarked roots keep the visible legacy fallback.
- Migration54 requires exact runtime3.8.2/native14/full53 provenance. Public52 installs unchanged53 before54. Historical checksums and native schema bytes are unchanged. Full53 readers reject54; postmigration recovery requires a54-aware fix-forward reader.

## Checks actually run

- Preimplementation failure inventory recorded in `PRODUCT54-FAILURE-MODEL.md`; owning test initially failed on missing implementation.
- Real local PostgreSQL16: dedicated `lingxiloop_product54_test` plus test-owned disposable databases. Explicit `npm run db:migrate` installed1–54; second invocation reported `already current`.
- Owning product54 integration proves53→54 DDL/ledger rollback, exact old inventory preservation, NULL/default/check constraint, old53 reader rejection, old/new formal admissions, callback-loss retry, original-identity isolation, inherited scope, atomic routine rollback/retry, and100 persisted memory activity records across real API first read/reconnect/pagination. It checks private bodies never enter public output.
- The existing migration, public group mention and native collaboration integration selection initially ran41 tests:35 passed,6 stale fixture assertions failed. Five migration fixtures expected53 or omitted the new nullable column; the group fixture omitted the newly registered `memory.summary` tool. After correcting only those expectations, the five affected migration tests passed5/5 and the group file passed3/3. The latter additionally proves all four actual A→B→C→A public run bindings retain version1. The other35 checks were not needlessly rerun.
- Related projection, AssistantTransport and1,100-call bounded activity tests passed25/25. Answer-first v2 export passed8/8 and matched `e2e/answer-first/projection-snapshots.json` byte for byte.
- Server TypeScript and Biome lint of all11 changed TypeScript files passed. `git diff --check` passed.

The local publication candidate is product54/runtime3.8.2/native14. This is not a production rollout receipt. GitHub credential401 and production403/Cloudflare1010 are unresolved; neither was retried.
