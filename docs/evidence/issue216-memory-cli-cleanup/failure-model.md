# Memory maintenance CLI shutdown failure model

Written before implementation and the focused regression. The public `memory:maintain` CLI imports the product runtime, which opens business Redis command/subscriber clients. Its current finally stops native control and closes only the primary PostgreSQL pool. Business Redis remains open and the presentation pool is omitted. This is a CLI lifecycle defect; it does not establish the cause of the original memory recall problem in #216.

Failure cases:

- Successful inspect/migrate/reindex leaves Redis handles alive, so a one-shot process does not terminate naturally.
- A native control shutdown failure skips all remaining cleanup.
- One Redis disposer fails and prevents the other Redis client or PostgreSQL pools from closing.
- Raw cleanup errors leak connection information or private text through uncaught AggregateError.errors. Keep only fixed failed-stage names and verify an error sentinel is absent from stdout/stderr.
- A PostgreSQL close failure is swallowed and the CLI reports a successful exit.
- The maintenance operation itself fails, but resources are still left open.
- Argument validation throws before entering the cleanup boundary, although imports already opened clients.
- A test hides the problem by force-exiting, clearing outstanding handles itself, or using the real production environment.

Use existing product exports: `stopLingxiOSControl`, `sub.disconnect`, `redis.disconnect`, `closeDatabasePools`. Preserve shutdown order, attempt every disposer, and propagate cleanup failures. Put argument validation inside the same cleanup boundary. Do not change maintenance authorization, API arguments, output payloads, database schemas, dependencies, or runtime configuration. No forced exit.

Verification: run the real CLI entry in isolated Node child processes with public dependencies mocked. Both mocked Redis handles deliberately keep the child alive until their own disconnect is called. The parent must observe natural termination, exact cleanup order and failure exit status for successful work, failed work, invalid arguments and each failed disposer. No production access or provider calls. Then run owning server lint/typecheck.

## Result

The seven child-process cases first failed against the unchanged CLI because both mocked Redis handles remained alive (5s timeout per case). After the scoped fix, all seven complete naturally in about2s total. Each case confirms cleanup order `control → subscriber → redis → database`; cleanup-error sentinels do not appear in stdout/stderr. Cleanup failures are represented only by fixed stage names. If the operation itself fails, its existing exception remains authoritative after all cleanup attempts.

Verified with Node22.23.3, no `--test-force-exit` and no production imports:

```sh
node --import tsx --experimental-test-module-mocks --test server/src/__tests__/memory-maintenance-lifecycle.test.ts
npm run server:lint
npm run server:typecheck
```

All passed. The actual CLI entry is exercised with mocked public dependency boundaries; this is not a production maintenance run or a provider/index completion check. Frozen release and temporary operator scripts are unchanged. This fixes CLI resource ownership, not the original cause of inaccessible or unindexed memory documents.
