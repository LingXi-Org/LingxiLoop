# Native14 education-plan prerequisite

Prepared offline only. The parent is the sole production executor. This folder
contains no production result and does not imply authorization to retry a saved
unknown operation.

Source: `7fe5b16e08dbe6634feb701d64e26c28475b917e`.
Reviewed product source: `f749849e767250979469a21529fa390cf6d66daa`.
Public driver: `19422466f8463a3a1099c6fbfdd3b92d0228e1b5`.
The eventual plan target may be a later integration commit; the wrapper requires
its seven definition files to remain byte-identical to the reviewed target.

`provenance.json` identifies and hashes the exact seven source/target files.
`build-seed-precheck.mjs` reads those immutable Git objects without importing or
calling `ensureEducationPlan`. The inspected `ensurePlan` algorithm selects six
non-teacher capabilities plus `teacher.expensive_compute=true` and
`teacher.compute_tier="pro"`. The two teacher limit codes are not in its seed map.
`canonical.json` contains only these public constants.

The SQL compares every column assigned by those existing upserts:

- `plans`: the fixed ID, code, name and status, one expected row.
- `entitlements`: eight fixed IDs, codes and descriptions.
- `plan_entitlements`: eight exact compound keys and JSONB values.

`missing` counts absent expected rows; `mismatched` counts present rows with at
least one different assigned value. `plans`, `entitlements`, and
`planEntitlements` count present expected rows. A pass is exactly `0/0/1/8/8`.
Extra rows outside the upsert keys are not modified by this seed and are not
classified as drift. No plan/entitlement/identity is created by this query.

The SQL uses a repeatable-read read-only transaction and rolls it back. RLS is
set off so restricted visibility fails rather than silently filtering; the
marker additionally requires the existing role to be superuser or bypass RLS.
There is no grant, account change, `ensureEducationPlan` call, or data write.
It has 10-second statement, 3-second lock, and 15-second idle transaction limits;
the fixed native shell adds a 30-second `timeout` with 5-second kill grace.
Only the existing Core `postgres` service/environment is used.

Matching logical values do **not** remove the public migrator's existing
`ON CONFLICT DO UPDATE` writes. This check establishes that those assignments
preserve the canonical logical values; it does not establish a physical
no-op, hold a lock across the release, or authorize repairing a mismatch.

## Execution contract

The helper uses `loadPreSeedInputs()` in the reviewed parent `../inputs.mjs`.
This explicit pre-seed loader accepts only the fixed `seed/receipt.json` path
with its hash `null` (meaning pending), and does not read a nonexistent seed.
The final `loadInputs()` remains strict: it needs the actual completed receipt
and real hash. Both retain the same other evidence checks. The parent must first
provide actual `inputs.json`, sealed `plan.json`, accepted source and production
bytes, audited images and successful exact CI evidence. Missing inputs remain
pending; the helper never guesses a target, acceptance or plan hash.

Offline, after those inputs exist:

```sh
/workspace/.tools/node-v22.23.3-linux-x64/bin/node \
  /workspace/native14-production-release/seed/run-seed-precheck.mjs --check
```

Only after the parent reviews these artifacts, using its existing in-memory
Komodo authorization, immediately before release execution:

```sh
/workspace/.tools/node-v22.23.3-linux-x64/bin/node \
  /workspace/native14-production-release/seed/run-seed-precheck.mjs --execute
```

Output is exclusively created at
`/workspace/native14-production-release/seed/receipt.json`; an existing file
blocks before any API call. Do not delete/overwrite an unresolved attempt.
The wrapper has a 180-second abort deadline; interruption does not prove the
native query was cancelled, so a pending ID remains uncertain and is not retried.

Before and after its one Core `RunStackService`, the wrapper uses the frozen
public source, full-config, audited-image and exact four-container guards.
It compares the accepted source IDs/images/policies and keeps protected
environment/configuration data only in memory. Only config hashes and an
identity/policy projection hash are persisted.

The existing transport verifies a fresh terminal; the wrapper additionally
reads that exact `GetUpdate` and compares identity, success, timestamps and the
single `NATIVE14_SEED_CHECK=` aggregate. Any ambiguous reply stops all following
requests. Neither output nor errors persist raw native logs.

## Final collector interface

`seed-contract.mjs` exports:

```js
parseSeedUpdate(update, { expectedId, coreStackId })
assertFreshSeedUpdate(previous, fresh, { expectedId, coreStackId })
validateSeedReceipt({
  plan, planRaw, receipt, executionStartedAt, coreStackId
})
```

The parser returns `readOnly`, `fullVisibility`, `canonicalSha256`, `counts`,
`equal`, and `native`. The native projection is
`{id,operation,target:{type,id},status,success,startTs,endTs}`.
The final collector should freshly read the saved ID and compare this entire
projection and all five aggregate fields to the receipt. It must also bind the
receipt's raw bytes and source-production hash to the actual accepted source.

The successful receipt schema is `receipt.schema.json`; relational validation
requires the exported function as well. It enforces fixed artifact hashes,
actual plan bytes/source/target, exact Core ID, two equal guards, exactly one
submitting→pending→complete native sequence, no failed/uncertain event, and
seed completion before execution with at most 30 minutes between them.
Use `release-execution.startedAt`, not the final verification time following a
potentially long backup.

The seed is separate from the release's 43 native operations. Its ID must be
distinct, yielding 43 release receipts plus one seed receipt, not 44 release
operations.

## Offline evidence and limits

`contract-green.log`: six existing narrow parser/receipt/SQL-source checks pass.
All five `.mjs` files pass Node syntax checking. `wrapper-static-check.json`
records offline import and fixed oneoff-envelope checks. No SQL was submitted
to a database, no native job was run, and no actual source/target plan or
production success is claimed.

The initial `contract-red.log` is an editing syntax failure (an extra test
parenthesis), not evidence of a behavioral red test. It is retained honestly.
The positive test invokes the real exported receipt validator and exercises
drift, wrong/duplicate native identity, contradictory fresh timestamps,
unknown-event history, guard mismatch and stale/future timing refusals.
