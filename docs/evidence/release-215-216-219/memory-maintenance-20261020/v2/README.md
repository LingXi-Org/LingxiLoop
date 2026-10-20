# Issue 216 existing-identity maintenance handoff

Frozen local draft: `draft.mjs`, SHA256 `d7eeed3847179f28538625e1a5bd19df295ed33f4a85692cfd87e471afae9c34`.
Only root may execute production. This artifact is not a production success receipt. Frozen candidate source was not modified.

## Entry and carrier

The remote ESM code is the exact draft contents followed by one explicit call:

```js
await main('inspect'); // or 'execute', or 'status'
```

Run using the image's existing Node + tsx (`node --import tsx --input-type=module -e <code>`), without writing files to the host or /app. `export main` does not depend on an argv guard for this entry.

Existing db-migrate lacks the full product runtime environment. It is not a valid carrier. Root is reviewing a restricted one-off of the existing lingxiloop service using its existing environment; do not copy credentials, add dummy variables, weaken ACL, or modify Compose/native safety. Passive control initialization is required and included. The script does not start worker loops or provider calls; existing Workers own queued work.

- `inspect`: discover existing references/bindings, public scopes authorization, one complete public migrateLegacy dryRun scan, private original-continuity accounting, authorized scope doctor. DryRun can lock/create native scope bookkeeping, so this is not a strict read-only SQL transaction.
- `execute`: same complete initial inspection, public migration, repeat inspection, then doctor and public reindex only for missing indexes in currently authorized scopes. Each successful migration page emits cumulative deduplicated progress. Never force inaccessible legacy scopes into reindex.
- `status`: discover existing references/bindings, public scopes authorization and doctor only. No migrateLegacy call, including dryRun, and no reindex. Original-continuity and inspection fields are explicitly skipped (`continuity:null`, `legacyInspectionPerformed:false`). This is the short post-worker readback path.

## Bounds and receipts

At most 64 discovered identities; baseline at most 256 continuity documents; per identity migration scan at most 8 pages of 16; at most 512 public/reference calls. Internal deadline checked before each API call is 130 seconds; external recommended limit is `timeout -k 5 180`. An in-flight DB/API call may outlast the internal check. Existing DB statement timeouts still apply. No automatic retry. An external timeout or missing terminal receipt leaves outcome unverified/possibly partial.

Maximum output allowance 540 prefixed JSON lines / 2 MiB is sufficient for 512 call budget plus fixed phases. `migration-progress.complete:false` is an expected intermediate receipt, never terminal success. `confirmedPages` is cumulative across identities. Retain partial progress if a later call fails. A successful queue count is not index completion. Current native enqueue has a per-scope batch bound and existing terminal work/fence rules may result in zero queued despite missing indexes; this remains explicit.

Accept only native RunStackService Complete/success, process exit zero, exactly one final `status:complete` / `operationsComplete:true` matching requested mode and `cleanupComplete:true`; final is emitted only after successful cleanup. Preserve original four-service health/provenance acceptance separately. The final flag `indexingCompleteForAuthorizedScopes` requires at least one scope and all authorized scopes configured/currently covered. It never asserts global coverage.

## Fixed output projection

`approved.json` supplies codeSha256, allowedKeys and allowedValues for root's strict scalar/key sanitizer. `reviewed:true` means local source/synthetic review only. Its reviewScope metadata is not remote emitted output.

`output.schema.json` additionally supplies exact nested phase-specific shape, no extra fields, only fixed enums/booleans/null/nonnegative safe integers. SHA256 `43a3ac87b2e4df02a738c80f77c8a861b8c641d9ff85a88afe35f129e85a343c`.

No body, identity, scope ID, cursor, provider setting, key, credential, or raw exception is emitted. Third-party stdout/stderr is suppressed before runtime imports. Native NoEffectError uses `.code === 'forbidden'`; product ForbiddenError is recognized by class. Unknown errors do not become authorization denials or zero counts.

## Interpretation and observed production baseline

Root's already verified aggregate receipt recorded 25 active continuity candidates requiring public authorization, 15 intentional non-continuity legacy documents, and 40 active eligible index documents with no current-version index under any key; no queued/leased/failed/cancelled index jobs. Thus issue216 was not zero-applicability. The maintenance code neither claims this is a new runtime defect nor proves all 40 are authorized for indexing.

Migration scans tenant+author and can revisit a document through several source runs. All reported documents are deduplicated by tenant+document ID internally. Original continuity candidate IDs are captured internally and tracked separately. Session/agent_role `ownership_or_audience_not_proven` isolation is expected and not counted as a continuity migration failure. An identity unavailable, missing a current binding, cancelled, revoked, or a candidate not observed remains explicitly uncovered; do not invent replacement identity/run/fence or expand grants.

## Local validation

Node22 syntax check passed. `offline-smoke.json` covers status zero mutation calls, across-identity deduplication, separate session isolation, zero-authorized-scope incomplete result, progress surviving a later failure, primitive exception sanitization, forbidden accounting, and no identifiers/doctor payload in output. `synthetic-events.json` contains only synthetic aggregate output. All 18 events validated against the exact JSON schema; an added identifier field was rejected (`schema-smoke.json`). No production imports/API calls were used by these tests. Product main runtime execution, environment completeness, actual migration outcomes, provider/index worker completion, and final global residual classification remain for root's verified production receipts.

## Reindex acknowledgement correction

Independent review first recorded two failing examples on the prior draft. The final draft validates each enqueue acknowledgement inside the mutating uncertainty boundary, then immediately emits `reindex-progress` with `complete:false` and a copied cumulative queue count. Unknown/malformed results never increase confirmed counts; previous progress is retained. Root must allow this intermediate phase and retain its latest confirmed `queued` count on terminal failure. Five independent synthetic examples pass after the correction (`reindex-fix-green.log`). No new production call was performed.


## Production-inspect lifecycle correction (v2)

The original production receipt remains untouched at `/tmp/lingxi-canvas-release-20261020/memory-maintenance-inspect.json`. Its application final said complete, but native RunStackService failed after about180s; it is not verified success. Previous code and exact schema/approval are retained as `draft-013d.mjs`, `output-013d.schema.json`, `approved-013d.json`. Their exact original code013d/schema9b4 hashes were rechecked.

Source diagnosis: runtime imports the product business Redis module, which eagerly creates both redis and sub. stopLingxiOSControl closes native control plus dedicated preview/object stores, and closeDatabasePools closes PostgreSQL only. Formal web.ts and worker.ts explicitly disconnect business redis/sub separately. The earlier maintenance draft omitted that disposer. This is a definite lifecycle omission; the old final-before-cleanup receipt cannot identify which exact cleanup stage occupied its timeout.

V2 follows the existing product shutdown approach, invoking public redis/sub.disconnect(), then observing each client's end status. It emits fixed cleanup-progress pending/complete/failed stages for control, business-redis, database, each with elapsedMs. Every remaining disposer is attempted even if an earlier one failed or exceeded its10s stage limit. Redis end observation is bounded5s. Failure emits no final success; there is no forced exit. Actual in-flight work or an external timeout can still prevent a success receipt. Final now occurs only after cleanup and includes cleanupComplete:true. The host wrapper must require this plus native Complete/success/exit0.

Operations retain the130s check-before-call deadline and external180s limit. MAX_CALLS is512, with an execution-budget marker and a pre-mutation reserve gate: eligible identities*8 + all identities*8 + all identities + initially observed authorized scopes*3. This reserves maximum migration and after-inspection pages, scope refresh, doctor-before/reindex/doctor-after for the observed scope set. Later authorization changes/scope expansion do not bypass the hard cap; such changes can still cause a partial safe stop, whose confirmed progress remains available. The gate runs before any non-dry migration. An initial dryRun remains native bookkeeping, not strict read-only SQL.

To avoid unnecessary calls, inspect makes one full dryRun scan and one doctor pass; its after summary reuses the same observation and does not emit inspect-after. Execute retains a full before and after scan, migrates only identities whose before scan had eligible items, and reuses its prequeue doctor snapshots; each actual public reindex independently reauthorizes. status remains scopes/doctor only.

Isolation reason counts now include only documents that were never eligible or migrated in the summarized scan. The five records eligible for one identity but isolated under another are excluded from final-isolation reasons. Multiple reasons for one remaining isolated document can still overlap; the map is not guaranteed to be a mutually exclusive partition.

Local validation: original five independent cases plus seven lifecycle/budget cases all12 pass. The25identity/31scope one-page batch completes in223 calls; the production-shaped41-page scan batch completes execute in260 calls, with5 unique migrated documents and31 enqueue scopes, within512. A64identity conservative plan fails before non-dry migration. Local loopback real IORedis clients reach end and the child process exits naturally with no forced exit. All64 captured synthetic events validate against the updated fixed schema. These checks do not establish the next production run's outcome.
