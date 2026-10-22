# Shadow knowledge PG gate

Issue #323 adopts the two previously temporary, input-free operator modules: `knowledge-shadow-pg-gate.mjs` and `knowledge-shadow-pg-coordinator.mjs`. No release-specific transport, private configuration, production receipt, or credential is included. Synthetic tests are the only executable fixtures.

The coordinator exports `coordinatePgGate({operator, pgCode, config, expected, callbacks})`. The sole release operator supplies the already audited image/container/configuration expectations, exact finite metadata scope and separately authorized finish/start/abort callbacks. It does not discover credentials, deploy by import, replay an update or recover a pointer. The helper is a Node `--input-type=module -e` payload: its JSON argument is private scope metadata and `DATABASE_URL` remains injected through the existing operator environment. Never put either in a committed fixture or an example copied from production.

The coordinator pins the helper bytes with `PG_HELPER_SHA256`. Read the helper from this checkout and verify that digest before preparing any separately authorized operation. The existing maximum scope sizes and public SQL metadata projections remain unchanged. This PR does not run the tool in production or change the previous cutover's outcome.

At normal expiry, a heartbeat which crosses the deadline must still pass all identity, same-transaction, binding and complete lock checks. It emits no expired `held` row, then rolls back and verifies zero self advisory/ShareLock locks before a deadline receipt is successful. Query failures, identity drift, lock failures, signals and unproven release remain failures.

A failed final wait may be classified as `native-failed` only after two bounded reads confirm the same owned update, operation, stack, start/end timestamps and `Complete/success:false`. It never becomes successful; unrelated identity, pending/true terminal state or unavailable observation is not a success fallback. A 401/403 stops without another read. Diagnostics project metadata and fixed codes, not external error messages or raw logs.

Run the owning synthetic checks with Node 22:

```sh
node --experimental-test-module-mocks --test scripts/knowledge-shadow-pg-*.test.mjs
```

CI runs these in `deploy-contract`; the `ci` path filter selects the check without adding a deployment scope or publishing images. Merge this operational-only change with `[skip deploy]`. The historical failed helper and strict coordinator receipt remain unchanged; fixing future behavior does not make an older failed receipt pass.
