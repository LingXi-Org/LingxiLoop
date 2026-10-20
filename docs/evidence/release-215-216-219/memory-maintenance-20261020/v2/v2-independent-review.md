# Issue216 v2 independent recovery review

**GO for the frozen v2 inspect → budget review → execute → status workflow.**
No P1/P2 remains in the reviewed changes. Root remains the sole production
executor. This review made no production request or data change.

Frozen artifacts:

- `draft-v2.mjs`:
  `d7eeed3847179f28538625e1a5bd19df295ed33f4a85692cfd87e471afae9c34`
- `output-v2.schema.json`:
  `43a3ac87b2e4df02a738c80f77c8a861b8c641d9ff85a88afe35f129e85a343c`
- `run-memory-maintenance-v2.mjs`:
  `6863fa29c1ac61646fc885255da8614fda179d1bb3277fead285ff2c380c2a15`
- Remote approved metadata:
  `1aa8446ccfb6317074bbd8ced332ce05cebe7e1a99404068e8b8b98ce6f8789d`

The remote frozen copy and live authoring copy were byte-identical; code/schema
hashes and the caller's copied approved metadata matched. Native adapter and
accepted-target guard are unchanged.

## Cleanup correction

The script now registers the existing product business Redis clients for cleanup
before importing/starting passive runtime control. Cleanup proceeds through:

1. Runtime control and its owned preview/object resources.
2. Existing business `sub` and `redis` clients, invoking their existing disconnect
   operation and requiring each client to reach `end`.
3. Both product PostgreSQL pools.

Each stage emits fixed pending/completed/failed status and elapsed milliseconds.
A stage failure or bounded timeout does not skip the remaining cleanup stages,
and any cleanup failure prevents final success. The final application marker is
emitted only after cleanup succeeds. There is no `process.exit` to conceal live
resources or a cleanup failure.

The caller requires all three exact pending→complete pairs in order, a unique
last final marker with `cleanupComplete:true`, native Complete/success:true and
fresh exact GetUpdate readback. A previous complete application marker with a
failed native operation is not accepted.

## Bounded execution and accounting

The hard call cap is 512. Before any non-dry migration, the script checks a
conservative remaining budget for every initially eligible identity's maximum
8 migration pages, every authorized identity's maximum 8 post-migration pages,
scope reacquisition, and three calls per initially authorized scope.

Only identities with a proven eligible result from the complete initial dry-run
scan are submitted for real migration. The public API still rechecks current
ownership/authorization/fences. Inspect avoids redundant dry-run and doctor
passes; execute uses its validated doctor snapshot to decide whether to request
reindex, and the public reindex API performs current authorization again.

The budget is conservative for the initial scope set, not a reservation against
concurrent scope expansion. Later added scopes or a wall-clock deadline can
still stop the operation. The hard cap and partial receipts remain active;
automatic retry or a claim that every operation must complete is not permitted.

Isolation-reason counts now exclude documents that were eligible or migrated
through another identity. Each reason counts distinct finally isolated
documents. Multiple reason categories can still overlap for one isolated
document, so their sum must not be treated as a disjoint partition.

## Caller and output

The v2 caller uses a new write-once receipt namespace and requires a new
successful v2 inspect with exact same code hash before execute. Old script,
approval and failed inspect receipt remain historical evidence.

The fixed bound increased to 540 projected rows / 2 MiB, consistent with at most
512 counted API operations plus fixed phases and cleanup. The exact schema and
key/value sanitizer still reject identifiers, arbitrary text and unexpected
fields. Confirmed migration/queue progress is preserved. Unresolved GetUpdate
confirmation remains uncertain and stops all subsequent operations.

## Independent local verification

- `v2-independent-green.log`: **14/14 PASS**, independently rerun against the
  frozen-equivalent script. Includes current permission denial, status without
  mutation, malformed reindex acknowledgement, partial queue progress, synthetic
  25 identities / 31 scopes / 5 eligible identities, oversized budget rejection
  before real migration, reason overlap, ordered cleanup, cleanup failure and
  cleanup timeout.
- `v2-independent-schema.json`: all **64** supplied synthetic output events
  validate against the exact frozen v2 schema.
- Remote and caller syntax checks: PASS.
- Implementer's `redis-natural-exit.json` records two local loopback IORedis
  clients reaching end and natural process exit without forced exit. This
  reviewer read that evidence; it was not a production reproduction.

## Previous failure and production state

The old native operation `6ad78db1e06d5e1f7983730e` remains Complete/success:false
after 180739 ms. Its application inspect completed, but its final marker preceded
cleanup. The missing common Redis cleanup is proven in source; the old logs do
not identify the unique blocking resource or contain an explicit timeout exit
code.

Fresh evidence independently compared after that failure confirms the accepted
four containers, images and public policies unchanged; all remain healthy with
zero restarts and no OOM. All three full-config and Compose hashes match the
pre-inspect guard. See `inspect-failure-independent-review.md` and its two
comparison artifacts. A safe unchanged deployment does not convert the failed
maintenance operation into success.

Actual v2 initialization, cleanup completion, migration eligibility/results and
asynchronous index completion still require the new native terminal receipts
and final doctor/status results. Queued work remains distinct from indexed work.
