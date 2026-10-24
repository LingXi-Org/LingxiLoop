# Integration consolidation — issue 371

Baseline: `190930ffbd6d2f14d6d2430b6e41e0bdd2373bb9`. All edits are under `server/src/__integration__`; no product, runner, CI or deployment code changed by this worker.

| Before | After | Reason and retained behavior |
|---|---|---|
| `agent-bloub-avatar.test.ts` plus `agents-vertical-slice.test.ts` | `agents-vertical-slice.test.ts` | Fold the avatar-only fixture into actual agent creation. Still asserts PostgreSQL 23514 and named CHECK constraint for forbidden agent portrait, and persistence of human portrait URL. Removes one independent database boot/reset/teardown. |
| `visualize-numeric.test.ts` plus `visualize-diagram.test.ts` | `visualize-computed-actions.test.ts` | One actual actor/run fixture and two grouped scenarios. Each action still parses, authorizes, executes, reads back and verifies its distinct document. Each retains computation-specific invalid input, cancellation, unbound-run and revoked-member rejection with unchanged document count. |

Four owning files / eight tests became two files / five tests. Repository integration inventory became 119 → 117 files. Three old files were physically deleted; one consolidated file added. The assertions are not replaced with source-string checks. No expensive homework lock/authorization case or historical migration was deleted.

Same local PostgreSQL service, dedicated `ci371_pruning_test`, own disposable Redis on 18445, exact installed formal LingxiOS 3.8.11, serial Node test execution:

| Run | Files | Tests / pass / fail / skip | Process wall time |
|---|---:|---:|---:|
| Before | 4 | 8 / 8 / 0 / 0 | 23.899 s |
| After | 2 | 5 / 5 / 0 / 0 | 13.095 s |

Observed local process reduction: **45.21%**. This is one local before/after observation, not a CI job critical-path measurement or statistical benchmark. Both runs use synthetic inputs and no provider calls. Biome lint passed on both retained/added files.

Artifacts in `/workspace/issue371`: `integration-pruning-before.log`, `integration-pruning-after.log`, the corresponding `*-result.json`, `integration-pruning-evidence.json` (including log/source hashes), `integration-pruning.patch`, `integration-pruning-failure-model.md`. Original owning sources are retained in `integration-before/`. Own database/Redis remain available for evidence checks; no prior test database or release qualification artifact was changed.

Suggested core smoke: `identity-vertical-slice`, `permission-resolver`, `native-message-flow`, `runtime-realtime`, `public-activity-history`, `basic-process-recovery`, `public-run-activity`. The realtime file requires `LINGXIOS_TEST_REDIS_URL` to avoid a skip. Previous local shard case timing suggests these fit the intended small suite, but actual new smoke/Actions measurement belongs to the integrator. Heavy suites remain available by affected ownership and explicit full/deep entry points.
