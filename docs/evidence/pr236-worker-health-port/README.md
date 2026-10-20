# PR236 Worker health port fixture repair

Base: `2a1d3f286485ebe4642ec56664d16f668731d3cc`. Only the owning integration test changes: Worker health port `52992` → `29092`, plus one rationale comment. Normalizing those two lines reproduces the original file byte for byte (`test-diff-proof.json`). No product/runtime code, dependency, migration, timeout, budget or assertion changed.

## Cause and scope

Image workflow `39410273533` reported 339 pass / 1 fail / 13 skip. The owning case failed during Worker startup with `EADDRINUSE :::52992` in 581.1054 ms, before model/context assertions. The previous PR CI at the same head had passed. The CI listener/process occupying that port was not captured. Its ephemeral range was not captured either.

The local Linux ephemeral range was 32768–60999. This includes 52992; matching CI allocation is a hypothesis, not a measured attribution. Port 29092 is outside the observed local range and had no other fixture assignment; adjacent fixtures use 29093/29094. This is a minimal fixture allocation fix, not a claim that any fixed port can never be occupied.

## Controlled red → green

A single owned loopback listener, PID 1781314, held 52992 continuously across both runs. Port 29092 was probed free before the experiment. Both phases used the normal migration and repository integration runner, a new exclusive database and an owned Redis. No extra context or runtime budget overrides were added.

| Phase | Result | Case / total duration | Evidence |
| --- | --- | --- | --- |
| Original base, held 52992 | 0 pass / 1 fail / 0 skip; `EADDRINUSE :::52992` | 712.195220 / 2502.493277 ms | `red.log`, `red-scripted.json`, `red-receipt.json` |
| Port 29092, same held 52992 | 1 pass / 0 fail / 0 skip | 24752.562901 / 26721.642976 ms | `green.log`, `green-scripted.json`, `green-receipt.json` |

Red made zero scripted model requests and completed zero turns. Green completed and delivered all 26 turns, recorded 85 requests / 85 ledger calls, and completed 25 compactions (final epoch 25). All requests streamed. Maximum request size was 440636 bytes; original continuity, exactly-once delivery, history-size and ledger assertions remained intact. `green-summary.json` contains the derived counts. Affected-file Biome lint passed (`lint.log`).

The raw green log retains two pending `/v5/work/wait` errors saying `control plane stopped` after the successful Worker stop; these are teardown messages, and the owning test exited 0. Raw logs are preserved without whitespace normalization. The source-only diff passes `git diff --check`.

## Reproduction and provenance

Use Node 22, the locked official runtime 3.5.8 dependencies and dedicated disposable loopback PostgreSQL/Redis targets. Supply the existing local fixture environment without printing credentials; unset live-provider mode. Hold a TCP listener on 127.0.0.1:52992 before both phases, keep it alive, and run sequentially in the original and patched checkout:

```sh
node --import tsx server/src/migrate-bin.ts
node server/run-integration-tests.mjs --file runtime-model-context.test.ts
```

The repository runner serializes files and validates that the database name identifies a test target. The actual private wrapper `/tmp/pr236-worker-health-port/run.mjs` reads the existing local test connection in memory, asserts loopback host/port and exclusive database ownership, whitelists the environment, and prevents live provider mode. Its hash and the held-listener/cleanup script hashes are in `source-proof.json`; no credentials are included here. The original full CI log hash and excerpt ranges are in `ci-original-proof.json`. `SHA256SUMS` covers all committed evidence except itself.

## Cleanup and limits

Normal migrations produced product 48, runtime 3.5.8, runtime schema 13 and protocol 11. The dedicated database `lingxiloop_pr236_worker_port_20261020_test` was dropped only after observing zero active connections. Owned Redis `lingxiloop-pr236-worker-port-test-redis` was stopped with exit 0 and removed. Listener PID 1781314 exited after SIGTERM; 52992, 29092 and 56437 were confirmed closed. See `database-cleanup.json`, `resource-cleanup.json` and `held-port-after-green.json`. No shared database, unrelated process or container was stopped. The previously tracked scripted artifact was restored; this directory preserves the new run separately.

This is a real local PostgreSQL/Redis/Worker run with scripted model responses and recording WuKong delivery, not a real-provider or final-image test. The full integration matrix and new-head image workflow remain for the parent integration gates; neither was rerun here. The experiment proves the port-conflict mechanism and full unchanged owning behavior after the fixture repair, not the identity of the original CI occupier.
