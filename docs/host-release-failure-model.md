# Same-schema host release: failure model (written before implementation)

This is an application-only release transaction, separate from native12→13 maintenance. It requires an accepted source, exactly the same formal runtime package/integrity, native schema, protocol, schema hash and all 48 product migration checksums. It never runs migrations, backup/restore, Git, a broad procedure, ResourceSync or infrastructure deployment.

## Failures and required boundaries

1. A caller relabels a different schema/package/inventory as compatible: compare both committed manifests/locks, formal installed package, image metadata on both hosts and the actual read-only database state. Reject before source writes or stops.
2. Wrong source acceptance, image audit or plan bytes: bind their SHA256 values; require passed receipts, exact source/image identities and successful exact-target CI qualification.
3. Source files or config drift, stale Core cache, wrong server, running procedure/migration, automatic deployment or unknown hooks: require available exact hosts and Stack IDs, native cache refresh without errors, exact per-stack file hashes and complete config readback. Core's source and policy remain unchanged.
4. Target Compose changes environment, security, volumes, commands or infrastructure: compare effective, non-interpolated Compose against the accepted source, permitting only immutable app image pins and `pull_policy`. Require `never` for all three target app services.
5. Docker image-store ID differs from OCI config digest: use actual per-host InspectImage.Id, bind audited index/RepoDigest, linux/amd64 and ordered RootFS diffIDs, then require each container's Image to equal its host's verified ID. Never guess the ID from config or index.
6. Image missing/drifted: normal release fails before staging or stopping. No implicit pull occurs during release. An explicit online-only preparation mode may stage a separately committed pull template, PullStack exactly `db-migrate`, validate its terminal receipt and actual image, then restore accepted source bytes. It never stops/deploys services; every live container identity/health remains unchanged. Partial/unknown preparation stops without retry or implicit recovery.
7. Compose attempts registry access or starts db-migrate: app target policy is precisely `auto_pull=false`, `extra_args=["--no-deps","--pull","never"]`, all three effective services `pull_policy: never`. Komodo RunStackService's `pull:false` only disables its explicit pull; the template policy is necessary for its `compose run`. Core's unchanged SQL oneoff retains its existing image/pull policy and remains an explicit availability dependency.
8. Partial host write or config update, lost response, wrong update operation/target: record submitting/known update ID before progressing, require terminal success and exact readback. Never retry unknown outcomes, never overwrite the prior receipt, never deploy after a failed stage.
9. Worker stop accepted but still running, identity replaced, live native leases/attempts/capture/outbox or prepared transactions: fail before any new Web. Both old Workers stop first; require two fresh zero-lease observations. Web connections and queued work are allowed; this is not a database-wide no-client barrier. Establish image qualification and re-inspect the original containers before the first source write. Once a target service becomes healthy, retain its exact container identity; a later replacement with the same tag is not silently accepted.
10. Web can remain available while Workers drain. Update Web A, Web B, Worker A, Worker B, verifying exact image and actual health each time. Recheck unchanged schema throughout. After new Worker A begins, its legitimate leases must not be confused with old-worker leakage; all old Workers must remain stopped/replaced.
11. Target unhealthy or policy changes: stop the sequence. Unknown operation => no further network action; known failure => only a fresh read-only compatibility check for recovery classification, never automatic rollback.
12. Recovery: preserve public source bytes/identities, original container evidence, stage and operation receipts. Only a separately reviewed recovery may restore prior public templates and redeploy the accepted compatible image after resolving every known update and proving the exact DB inventory again. No old-schema restore, no credential or environment export, no automatic replay of a partial receipt.
13. Two executors: exclusive local receipt creation and recorded ownership are necessary, but not a distributed lock. Native action/procedure idle gates are checked before every mutation. The designated sole production executor must serialize manual/CI entrypoints; this driver does not claim cross-host locking.
14. Receipt/log leakage: no config/environment, raw host source, API reply/log, credential, prompt or memory body enters progress/errors. Native WriteStackFileContents logs its argument, so send only exact tracked public Compose templates.

## Public command contracts

Komodo v2.3.3 [`bin/periphery/src/api/compose.rs`](https://github.com/moghtech/komodo/blob/v2.3.3/bin/periphery/src/api/compose.rs) (SHA256 `883bb3387a2a320f02831f61b6325817faa1f935f6cff3ecbf1f4c43161ea8ee`) issues a separate `compose pull` only when `auto_pull` is true, and builds `compose ... up -d <extra_args> -- <services>`. It does not itself add `--no-deps`. Core exposes PullStack; PullImage is an internal Periphery API and is not used.

Docker documents `up --no-deps` and `up --pull never`; `run` independently supports a pull policy. Real local Compose tests must prove that a cached image with `pull_policy: always` starts via `up --no-deps --pull never` without touching an unavailable registry or starting its dependency, and that a missing image fails without pulling. The metadata oneoff must use a template with effective `pull_policy: never`.

Sources: https://docs.docker.com/reference/cli/docker/compose/up/ and https://docs.docker.com/reference/cli/docker/compose/run/ ; Komodo tag https://github.com/moghtech/komodo/tree/v2.3.3 .

App B has an existing gateway service. The effective-Compose comparison retains it byte-for-byte at the parsed configuration level; neither the release nor image-preparation service selection includes it.

Local Compose2.40.3 uses `--no-TTY`/`-T`, whereas the reviewed Komodo2.3.3 builds `--no-tty`. Production's existing successful oneoff receipts establish compatibility there. The local oneoff test records its equivalent `-T` usage and does not claim native long-flag compatibility on2.40.3. The `up` flags are exercised exactly.

## Delivery boundary

The ordinary trigger remains fail-closed for host/pinned stacks. This first driver is explicit and does not call the legacy rollout. Persistent ResourceSync declarations and ordinary CI dispatch need a separately sealed integration before any generic rollout is reenabled. No production execution is part of local development/tests.
