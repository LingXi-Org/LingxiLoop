# Issue216 inspect failure: independent local evidence review

The known failed operation is native `RunStackService` update
`6ad78db1e06d5e1f7983730e`, targeting Stack
`6aa8a411b35d27bdd4e12aef` / existing `lingxiloop` service. Its terminal receipt
was re-read: **Complete, success:false**, duration **180739 ms**. This is a known
failed native operation, not a pending or unknown submission. No retry was
performed by this reviewer.

## Observed application result and limits

The operation emitted a final application summary with 219 calls:

- 25 existing identities authorized and fully scanned; no revoked/missing/
  cancelled identity was silently omitted.
- All 25 original continuity candidates were observed: 5 eligible under at
  least one authorized identity and 20 isolated. All remained legacy; 0 migrated.
- 15 agent-role documents were separately isolated.
- 31 authorized scopes contained 15 eligible documents with current index
  coverage missing; 0 enqueued.

The application marker preceded cleanup in the old script, so it does not prove
cleanup or process completion. Native success is false and the caller correctly
kept `verified:false` and did not authorize execute from this inspect.

`inspect-terminal-projection.json` has no exit code, timeout marker, killed marker
or cleanup failure marker. Its approximately 180-second duration is consistent
with the configured external timeout, but the logs do not prove a unique
blocking resource or a precise cleanup stage.

## Source-level cleanup defect

At frozen product 9a5, `runtime.ts` imports the Canvas index, which re-exports
`facade.ts`; that module imports the product `redis.ts`. Module initialization
creates the common business `redis` and `sub` IORedis clients.

`stopLingxiOSControl()` closes the preview Redis store and runtime object store.
`closeDatabasePools()` closes PostgreSQL pools. Neither closes the common
business Redis clients. The actual product Worker and Web lifecycle explicitly
close both with `sub.disconnect(); redis.disconnect()`. The old oneoff omitted
that existing cleanup step.

This is a concrete lifecycle omission and a plausible cause of the process
remaining alive after its application marker. Correct it using the existing
product clients, emit final success only after all cleanup succeeds, retain
bounded per-stage cleanup evidence, and do not mask failure with `process.exit`.
Actual post-fix process completion must still be verified by the native receipt.

## Budget and reason-count defects

With 25 authorized identities and 31 authorized scopes, even one page per scan
requires execute to make at least:

`2*25 identity/reference calls + 3*25 scan calls + 25 scope reacquisitions
 + 3*31 doctor calls = 243 calls`, before any reindex call.

Thus the old shared 240-call cap cannot complete this observed workload. A fix
must retain a hard bound, account for remaining scan/doctor/reindex calls before
the first real migration, and preserve partial receipts on a later deadline or
authorization failure. If event bounds increase, the caller's fixed line/byte
bound and schema must be updated consistently.

The old summary collected reasons across every identity attempt even when a
document was eligible through another identity. Consequently its 40
`ownership_or_audience_not_proven` reason incidences include the 5 eligible
documents; they do not mean 40 distinct finally isolated documents. The principal
classification, 5 eligible / 35 isolated, is consistent. Reason counts should
either count only the final isolated set or explicitly distinguish overlapping
attempt reasons.

## Accepted production state after the failure

The parent's new read-only postflight was independently compared locally with
the accepted release and the pre-inspect guard:

- Exact same four container IDs, image IDs and public security policies.
- All four healthy, running, zero restarts and no OOM.
- Same source 9a5 and stack sources; app stacks idle; all four public checks 200.
- The read began after the failed native operation reached its terminal state.
- The separate cache-refresh guard matches all three full-config hashes, all
  three Compose hashes and all four container identities exactly.

Evidence:

- `production-after-inspect-failure.json` SHA256
  `b66be5d333d143d1de894d9b29eea11228b153c68d2beffb782ea7e706f70911`
- `memory-maintenance-inspect.json` SHA256
  `6caac7496a9264c25b773924258e32b9022bed20dd5792bd6982deaf7013b176`
- `guard-after-inspect-failure.json` SHA256
  `e21a0eb2c0c68cf6f46a507c6d5f32e5550422bcbaeeb6fcb3fbf23d2fd7a703`
- Independent comparison artifacts:
  `/tmp/lingxi-canvas-release-20261020/inspect-failure-independent-state-comparison.json`
  and `inspect-failure-independent-guard-comparison.json`.

The accepted four-service deployment remains verified unchanged by these fresh
observations. This does not convert the failed maintenance job into success.

The old 013d401 script is **NO-GO for execute** until lifecycle/budget/reporting
fixes are independently reviewed. This report performs only local reads and
comparisons; no production request, credential, SQL, provider or service action
was performed.
