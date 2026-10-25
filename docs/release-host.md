# Fixed release host executor

Issue #495's host executor runs outside the application containers. It has no Komodo, model, application Web, or Worker dependency. This document describes the implemented module and the inputs still required to install it; repository tests are not production acceptance.

## Runtime and protocol

Linux, Node 22.23.3 or Node 24, `node:sqlite` (`--experimental-sqlite` on Node 22), `/usr/bin/flock`, and Docker Compose are required. Docker's executable is a fixed absolute local policy value. The executor binds loopback only; expose it through an independently verified Tunnel + Access HTTPS route. Both Access service authentication and the executor's separate bearer credential are required. Never expose the Docker socket over the network.

Run with a root-owned policy and systemd credentials:

```text
node --experimental-sqlite scripts/release-host/server.mjs /etc/lingxi-release/policy.json
```

Every HTTP endpoint requires `Authorization: Bearer <executor credential>`. Credentials, Access tokens, registry authentication and subscriptions are external secret references, never manifest values.

- `POST /manifests`: `{ "manifest": <complete release manifest>, "manifestHash": "sha256:<canonical-json-hash>" }`. Registration is immutable by release ID and does not write active configuration.
- `POST /operations`: `{ "releaseId", "target", "phase", "generation", "manifestHash", "parameters": {} }`. No command, URL, path or environment override is accepted in operation parameters.
- `GET /operations?key=<releaseId:target:phase>`: durable status; nonactive interrupted operations are observed again on each lookup.
- `GET /health`: executor protocol and supported finite phases.
- Optional gateway owner only: `POST /ingress` receives the fixed operation identity plus `enabled`; `GET /ingress?target=<configured target>` observes the loaded Nginx generation.

Phases are `prepare`, `drain`, `apply`, `verify`, `undrain`, `recovery-drain`, `recover`, `recovery-undrain`, `backup`, `restore-verify`, `migrate`, and `observe`. Preparation always uses generation **0**; controller-owned business operations use a positive generation. The key is `releaseId:target:phase`; its canonical request hash includes generation and parameters. A different request under the same key is rejected.

SQLite WAL with `synchronous=FULL` commits the operation intent, resource reservations and generation before HTTP 202. Kernel `flock` prevents two executor processes using one journal. Generation and release ownership are checked immediately before and after every side effect. A newer generation cannot displace an active or uncertain reservation. There is no lease expiry that automatically frees an unknown operation.

If a response is lost, query by key. On restart, unfinished intents are observed rather than executed again. Exact image/container, health, mounts, ingress generation and database completion evidence may prove success. Partial or contradictory observations remain `uncertain`, retain service reservations and require quarantine/diagnosis. A stopped CLI, timeout or expired TTL does not prove a Docker daemon operation stopped.

Responses preserve `errors.forward`, `errors.recovery`, and `errors.cleanup` independently. Error codes and available SQLSTATEs are returned without raw subprocess output, prompts, credentials or database row contents. Step start/end timestamps and operation timestamps support phase timing.

## Manifest host plans and trusted policy

Each public `manifest.targets[target]` has an adapter, public contract, and `hostPlan`. Supported fixed image adapters are `main-runtime`, `open-notebook`, and `wukongim`. A host plan contains:

```text
{
  version: 1,
  sourceMode: "image",
  mode: "maintenance",
  images: { <permitted service>: <qualified image identity> },
  contract: <exact public target contract>,
  configurationHash: "sha256:...",
  source: { images, contract, configurationHash },
  recovery: { images, contract, configurationHash },
  database?: {
    from: {nativeSchema, productSchema}, to: {nativeSchema, productSchema},
    migrations: [{version, checksum}, ... complete target ledger ...],
    strategy: "maintenance", rpo: "zero-committed-writes"
  }
}
```

An image identity has a canonical `ghcr.io/...@sha256:...` or `docker.io/...@sha256:...` reference, `indexDigest`, `platformDigest`, `configDigest`, ordered `diffIds`, `os: "linux"`, and `architecture`. These digest types are checked separately. Cache verification checks the qualified index/platform repository identity, Docker config ID, OS/architecture and exact layer identities. A fully verified cached artifact is reused without registry HEAD or pull. Missing artifacts are pulled only during preparation. A mismatching existing artifact is a fatal qualification error.

The source is the actual accepted original container identity. Recovery is independently chosen for the *installed* schema and data semantics. They may differ, and schema-changing plans must explicitly name both. Same-schema plans may omit `source` and inherit recovery. Preparation stores source, forward and recovery overlays in separate release directories; it does not replace active policy or the original project.

Contracts explicitly identify native/product schemas, API/Worker/checkpoint/control protocols, and capabilities. Optional supported schema sets are integer lists, not a compatibility boolean. Independent installed-state evidence supplies required capabilities. A recovery image lacking those capabilities is rejected before any old process starts. There are no historical per-schema release branches in this executor.

The root-owned `acceptedOpsShas` allowlist pins the actual installed executor commit(s). Manifest registration rejects a different `opsSha`; a tool update must preserve active release semantics rather than changing this allowlist during a run.

Local policy alone selects Compose project/file/env file, permitted services and roles, original durable mount sources/targets, fixed helper argv, database identity, qualified schema/checksum profiles, and ingress endpoints. The manifest cannot select paths, executable programs, shell text, SQL, secret values, Docker host or service names. Fixed helper programs receive operation data on stdin; helpers cannot be changed through the HTTP API. Inline shell/code argv is rejected.

`configurationFingerprint()` hashes the effective selected project/services/volumes, preserving command and entrypoint order while normalizing documented sets such as ports and volume declarations. Image and pull policy are checked independently. Resolved environment values stay inside the host; only their configuration digest is returned. Obtain the initial configuration digest from the verified host policy, then carry it as qualified release metadata; CI must not guess it.

The policy's original named volume binding is compared with effective Compose configuration and running container mounts. Existing volumes are inspected before starting services. No operation executes `prune`, `compose down`, volume deletion, database rollback or an unrestricted shell.

## Maintenance, ingress and recovery

`rolling` is rejected unless the exact concrete contract hash is present in the local `qualifiedRollingContracts` allowlist and real drain/admission controls exist. The default is maintenance; A/B topology alone does not establish task or connection continuity.

For maintenance, the controller concurrently drains every incompatible runtime host before applying any host. Each host stops its Worker with bounded SIGTERM grace while its local Web/control remains available, removes its backend from the stable ingress, stops local Web writers, proves their PIDs are zero, and waits for the shared read-only task/session/attempt/capture/outbox/prepared-transaction barrier within budget. Durable task/checkpoint rows and local homes remain intact. Clients experience maintenance and reconnect according to the application contract; the executor does not replay side-effecting HTTP requests.

After all drain receipts, the controller performs any database work once, then applies Web before the local Worker and verifies health/control readiness. Service updates are exactly equivalent to:

```text
docker compose ... up --detach --no-build --pull never --no-deps <fixed service>
```

Switch and recovery reject missing cache rather than downloading. All runtime hosts must apply and verify before the controller restores ingress. A previously drained global barrier is not confused with new compatible Worker leases created during the sibling's subsequent apply. Recovery uses separate `recovery-drain -> recover -> recovery-undrain` keys. A known post-apply startup failure may restore its prepared compatible code; an unknown Docker result is observed first.

`NginxIngress` edits only configured upstream membership and reloads the fixed stable gateway. It never stops the gateway or B's entire stack. SQLite saves the ingress intent before file/reload effects; an active Nginx listener returns each backend's loaded generation. Disk content alone does not prove a reload. Unknown reload results block further shared gateway edits until observed. Forward and recovery ingress operations have distinct keys.

Merge `gateway-state.conf.template` into the verified current complete configuration, retaining existing HMAC, origin routes, SSE/WS, timeouts and unrelated hosts. Mount the generated **directory** into Nginx, because atomic rename does not update a bind-mounted individual inode. Publish the state listener only on loopback. Populate initial generation-zero markers from actual current membership before handing ingress ownership to the executor.

## Independent database helpers

`local-control.mjs` reads PostgreSQL through fixed `docker exec --user postgres ... psql` argv and a snapshot-consistent read-only SQL statement. It verifies native/installed schema agreement, actual protocol, complete product migration checksums, full statistics visibility, and a root-owned capability profile keyed by actual schema identities. It works while application Web/Worker are stopped. Socket authentication is inside the existing PostgreSQL container; no password is copied into arguments. Profiles must be obtained from actual accepted schema evidence and qualified artifacts; empty/mismatching profiles fail closed.

Only the policy-designated owner can reserve `database:main` and run `database-tools.mjs`:

1. `backup` checks all old writers/leases/prepared transactions are absent; writes an exclusive binary `pg_dump`; compares source installed provenance and hashes of every user table's row count before/after; saves a durable dump hash and zero-committed-write-loss receipt.
2. `restore-verify` creates a deterministic isolated database, restores the exact dump, compares installed schema/migrations and all-table counts, and saves verification completion **before** cleanup. Cleanup has its own persisted receipt/error. Only that deterministic isolated database is eligible for removal. Existing source databases are never dropped or restored by recovery.
3. `migrate` requires that backup and restore receipt, an exact unchanged installed ledger prefix, the complete requested target checksums, the fixed cached migration image/service, and a DATABASE_URL matching the independently verified database. Its packaged command is fixed as `npm run db:migrate`, with one-off drain acknowledgement and no dependency start/pull/build.
4. Migration uses a deterministic named one-off container with `restart: no`; retain it as completion evidence. Observation requires **both** its exact image/final exit 0 and the target schema/checksum ledger. The application's database advisory lock remains the migration writer lock. Ledger completion alone cannot hide ancillary migration steps that failed afterward. No unknown migration is blindly rerun. Archive the receipt before independently cleaning up the stopped one-off.

The supplied snapshot/restore integration test uses a private `--network none`, tmpfs PostgreSQL fixture and artificial rows. It does not test a real application migration, production schema transition, remote backup storage, tenant permissions or accepted production traffic. Backups currently reside in the protected local release directory; the controller/integrator must archive required recovery artifacts to the trusted long-term destination before deleting anything.

## Deployment preparation and remaining installation inputs

`deploy/release-host/` contains policy, systemd, Tunnel/Access, Nginx state-listener and native Mihomo templates. They contain no credentials and execute nothing on checkout. Initial bootstrap is an integrator operation under the issue's separately confirmed production authority:

1. Inspect the actual accepted app/tool/image/schema/migration state, original Compose projects, volumes and recovery artifacts. Fill the policy from those facts. Use private root-owned secret files or the existing secret provider.
2. Build a bundle from the exact reviewed commit containing `scripts/release-host/` and `deploy/release-host/`; verify its SHA-256 on the host. Stage under `/opt/lingxi-release/versions/<ops-sha>` and validate the policy/artifact identities before changing the `current` pointer. Existing Komodo may transport that fixed bundle only during cutover; these modules have no Komodo dependency.
3. Install the fixed unit and credentials references; start the executor on loopback and verify authenticated health, immutable manifest registration, operation intent/query and restart observation. Do not update `current` during an active operation. A tool upgrade uses the same host journal and compatible wire protocol, under an idle/quarantined controller-owned maintenance boundary.
4. Verify an existing or explicitly authorized Tunnel + Access policy end to end, including service token headers and executor bearer authentication. The templates do not create or install a Tunnel, Access application or service token.
5. If authorized, install a checksum-verified native Mihomo binary separately from Docker. The secret provider imports nodes only; a subscription cannot override local ports/controller/rules. Persist the last known-good provider outside release preparation. Docker daemon, Git, BuildKit and Tunnel are different network clients; validate their actual registry manifest/blob/CDN paths independently. The initial daemon proxy change/restart belongs to the controlled migration window, not ordinary releases. No template weakens TLS or enables a LAN proxy/controller.
6. Transfer write ownership only after the controller and executor work and old automatic writers are fenced. Production acceptance and retirement of the old release path remain integrator responsibilities.

Required real installation facts are executor/Access credential references, verified Tunnel hostnames, actual project/container/volume identities, qualified configuration fingerprints, actual database schema/checksum capability profiles, compatible source/recovery image evidence, and the stable gateway's full preserved configuration. The module rejects Notebook repo source mode rather than guessing or mutating a repository; a production Notebook still in repo mode must either use a qualified fixed image adapter or receive a separately implemented exact-commit adapter before cutover. Independent component barriers/state helpers must reflect their real persistence contract rather than reusing PostgreSQL main-runtime claims.

## Validation

```text
node --experimental-sqlite --test scripts/release-host/*.test.mjs
RELEASE_HOST_DOCKER_TEST=1 node --experimental-sqlite --test scripts/release-host/database.integration.test.mjs
```

The optional Docker check requires the cached `pgvector/pgvector:pg16` fixture image and never pulls it. It only removes its own named fixture and tmpfs storage. Focused tests cover response loss, persisted key conflict, actual process exit after a side effect, restart observation without replay, partial unknown reservations, stale generations, online generation-zero preparation, source/recovery separation, cache/offline paths, original homes binding, schema/capability refusal, independent recovery keys, shared ingress concurrency/unknown reload, exact migration destination/checksum/final-exit checks, and cleanup errors independent of restore success.

Reference behavior: [Docker Compose single-service updates](https://docs.docker.com/reference/cli/docker/compose/up/), [fixed one-off migration execution](https://docs.docker.com/reference/cli/docker/compose/run/), [Docker daemon proxy configuration](https://docs.docker.com/engine/daemon/proxy/).
