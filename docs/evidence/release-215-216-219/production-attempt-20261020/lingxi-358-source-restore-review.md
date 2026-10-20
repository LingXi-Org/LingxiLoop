# Independent compatible-source availability recovery review

Reviewed locally on 2026-10-20 after the metadata preparation operation failed. No production API requests or mutations were made by this reviewer. Root remains sole executor.

Result: no P1/P2 finding. `node --check` passed. This report reviews the prepared operation; it does not claim production recovery has completed.

Reviewed `/tmp/lingxi-358-production/restore-compatible-source.mjs`, SHA-256 `008ccbfbac8d2886099915cb105ef059ce51427865afb698f06c2627e811a5d1`, and `RESTORE-SOURCE-FAILURE-MODEL.md`, SHA-256 `aae9f1c4bf7d9884ff3fca4706480c2031b02551eaed2e05444b295c5f3d77bb`.

The script validates the original sealed plan; requires the prior maintenance process absent; binds the unchanged attempt3 receipt hash and pre-migration uncertain boundary; and rejects any migration/recovery/completion phase. The exact known metadata update6ad76383e06d5e1f79836a3a must be terminal `Complete`, `success:false`, with the expected operation and actual appA identity. App, core and rollout action state must be idle.

Before any old service starts, the actual database must match runtime3.5.6/native12/product46, protocol/schema hash and full migration checksum inventory, with zero writer barrier. All four original containers must remain stopped with the original IDs, image IDs, source and restart counts. The original adapter also checks source image digest provenance. Source provenance is rechecked immediately before every later start; a zero-client barrier is correctly not required after a Web process has started.

The only recovery mutation is official Komodo2.3.3 `StartContainer`, naming an exact previously verified container ID and server. Official client/core source confirms this goes directly through the Periphery container-start operation without Git clone, Compose, image deployment or configuration changes. Each response is bound to update ID, operation and actual Server target; terminal success is required before inspecting the exact original container/image/source for actual health. The order is WebA, WebB, WorkerA, WorkerB. Unknown request/update results stop without retry. Final completion requires exact source provenance and all four original containers healthy.

There is no migration submission, database restore/reset, security or credential change, process kill, image rebuild, new maintenance attempt or paused3.5.3 soak action. Any evidence of product47/native13 blocks old startup. Public HTTPS postchecks remain the executor's separate required verification.

Supporting local evidence: `source-state-after-terminal.json` records verified read-only runtime3.5.6/native12/product46 at 2026-10-20T13:12:15.789Z. The recovery script independently rechecks current state, so this historical receipt is not a substitute for its barriers.
