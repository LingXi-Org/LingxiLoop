# Fixed release host executor

Issue #495's host executor runs outside the application containers. It has no Komodo, model, application Web, or Worker dependency. This document describes the implemented module and the inputs still required to install it; repository tests are not production acceptance.

## Runtime and protocol

Linux, Node 22.23.3 or Node 24, `node:sqlite` (`--experimental-sqlite` on Node 22), `/usr/bin/flock`, and Docker Compose are required. Docker's executable is a fixed absolute local policy value. The host templates use the privately installed `/opt/lingxi-release/node-v22.23.3-linux-x64/bin/node` and loopback port `17951`. Only the executor bearer is a mandatory systemd credential; optional Access/ingress/archive references remain root-owned files in `/etc/lingxi-release/secrets`. The executor binds loopback only; expose it through an independently verified Tunnel + Access HTTPS route. Both Access service authentication and the executor's separate bearer credential are required. Never expose the Docker socket over the network.

Run with a root-owned policy and systemd credentials:

```text
/opt/lingxi-release/node-v22.23.3-linux-x64/bin/node --experimental-sqlite scripts/release-host/server.mjs /etc/lingxi-release/policy.json
```

Every HTTP endpoint requires `Authorization: Bearer <executor credential>`. Credentials, Access tokens, registry authentication and subscriptions are external secret references, never manifest values.

- `POST /manifests`: `{ "manifest": <complete release manifest>, "manifestHash": "sha256:<canonical-json-hash>" }`. Registration is immutable by release ID and does not write active configuration.
- `POST /operations`: `{ "releaseId", "target", "phase", "generation", "manifestHash", "parameters": {} }`. No command, URL, path or environment override is accepted in operation parameters.
- `GET /operations?key=<releaseId:target:phase>`: durable status; nonactive interrupted operations are observed again on each lookup.
- `GET /health`: executor protocol and supported finite phases.
- Optional gateway owner only: `POST /ingress` receives the fixed operation identity plus `enabled`; `GET /ingress?target=<configured target>` observes the loaded Nginx generation.

Phases are `prepare`, `drain`, `apply`, `verify`, `undrain`, `recovery-drain`, `recover`, `recovery-undrain`, `backup`, `restore-verify`, `migrate`, `source-drain`, `restore-source`, `source-undrain`, and `observe`. Preparation always uses generation **0**; controller-owned business operations use a positive generation. The key is `releaseId:target:phase`; its canonical request hash includes generation and parameters. A different request under the same key is rejected.

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

An image identity has a canonical `ghcr.io/...@sha256:...` or `docker.io/...@sha256:...` reference, `indexDigest`, `platformDigest`, `configDigest`, ordered `diffIds`, `os: "linux"`, and `architecture`. These digest types are checked separately. Cache verification checks raw OCI graph proofs (`ociProof.index`, `.manifest`, `.config`: base64 of the exact original bytes), hashes each blob separately, proves the unique selected OS/architecture platform and config relationship, then compares all uncompressed layers. Docker classic and containerd stores expose different local IDs: an index/platform local ID requires a matching descriptor type/digest, matching repository digest graph and full raw proof; a classic config ID is checked independently. Returned `localImageId`/`localIdKind` record the actual store identity. They are never substituted for `configDigest`. The canonical ref and the graph-bound local index/platform/config references are inspected offline. A canonical-name miss can reuse a content-identical mirror cache after the full graph proves identity, without tag writes. A fully verified cached artifact is reused without registry HEAD or pull. Missing artifacts are pulled only during preparation. A mismatching existing artifact is a fatal qualification error.

Prepared Compose overlays and fixed migration services use the fully verified actual Docker local ID (`sha256:...`) with pull policy never; container/source/readiness/recovery checks compare that same proven ID rather than assuming the image ID equals its config digest. The source is the actual accepted original container identity. Recovery is independently chosen for the *installed* schema and data semantics. They may differ, and schema-changing plans must explicitly name both. Same-schema plans may omit `source` and inherit recovery. Preparation stores source, forward and recovery overlays in separate release directories; it does not replace active policy or the original project.

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

A host without a local PostgreSQL container (currently B) can instead use `policy.database.transport: "cached-client"`, an exact already inspected `clientImage: "sha256:<local image ID>"` (which may be a Docker29 index ID), the trusted original application's `envFile`, and `clientWorkdir: "/app"`. The observer first checks the cached image ID and Linux platform, then runs one fixed ephemeral client with `--pull never --network host --read-only --cap-drop ALL --pids-limit 32 --memory 128m`, a read-only bind mount of `pg-client.mjs`, and only the env-file **path** in argv. It does not exec into Web/Worker, pull/build, need a running application, or create a new network/Tunnel. The database URL stays inside that ephemeral container. `pg-client.mjs` has no sqlite or application-runtime import: it loads the cached image's `pg` through `createRequire('/app/package.json')`, executes the same compiled snapshot/read-only SQL and timeouts, emits at most 1 MiB of metadata, and closes the connection in `finally`. It accepts no SQL or extra argv and replaces raw driver errors with a finite code/optional SQLSTATE. The default/local-container transport on A still uses its PostgreSQL socket. For direct Web readiness, HTTP accepts only literal loopback or an address proved by `node:os.networkInterfaces()` to belong to this host; another private address or DNS name is rejected. Thus A can probe its actual `10.20.0.2:5183` listener and B its loopback listener, rather than substituting public ingress readiness.

Only the policy-designated owner can reserve `database:main` and run `database-tools.mjs`:

1. `backup` checks all old writers/leases/prepared transactions are absent; writes an exclusive binary `pg_dump`; compares source installed provenance and hashes of every user table's row count before/after; saves a durable dump hash and zero-committed-write-loss receipt.
2. `restore-verify` creates a deterministic isolated database, restores the exact dump, compares installed schema/migrations and all-table counts, and saves verification completion **before** cleanup. Cleanup has its own persisted receipt/error. Only that deterministic isolated database is eligible for removal. Existing source databases are never dropped or restored by recovery.
3. `migrate` requires that backup and restore receipt, an exact unchanged installed ledger prefix, the complete requested target checksums, the fixed cached migration image/service, and a DATABASE_URL matching the independently verified database. Its packaged command is fixed as `npm run db:migrate`, with one-off drain acknowledgement and no dependency start/pull/build.
4. Migration uses a deterministic named one-off container with `restart: no`; retain it as completion evidence. Observation requires **both** its exact image/final exit 0 and the target schema/checksum ledger. The application's database advisory lock remains the migration writer lock. Ledger completion alone cannot hide ancillary migration steps that failed afterward. No unknown migration is blindly rerun. Archive the receipt before independently cleaning up the stopped one-off.

The supplied snapshot/restore integration test uses a private `--network none`, tmpfs PostgreSQL fixture and artificial rows. It does not test a real application migration, production schema transition, remote backup storage, tenant permissions or accepted production traffic. Backups remain in the protected local release directory and must also receive a confirmed immutable remote archive receipt before the backup phase succeeds. `policy.archive` supplies only the trusted HTTPS base URL/token reference. Backup observation and every migration attempt use `observeArchive` (GET only) to recheck the exact manifest/generation/dump hash. The current upload limit is 90 MiB; larger dumps fail explicitly and remain local. No backup deletion is implemented.

## Deployment preparation and remaining installation inputs

`deploy/release-host/` contains policy, systemd, Tunnel/Access, Nginx state-listener and native Mihomo templates. They contain no credentials and execute nothing on checkout. Initial bootstrap is an integrator operation under the issue's separately confirmed production authority:

1. Inspect the actual accepted app/tool/image/schema/migration state, original Compose projects, volumes and recovery artifacts. Fill the policy from those facts. Use private root-owned secret files or the existing secret provider.
2. Build a bundle from the exact reviewed commit containing `scripts/release-host/` and `deploy/release-host/`; verify its SHA-256 on the host. Stage under `/opt/lingxi-release/versions/<ops-sha>` and validate the policy/artifact identities before changing the `current` pointer. Existing Komodo may transport that fixed bundle only during cutover; these modules have no Komodo dependency.
3. Install the fixed unit and credentials references; start the executor on loopback and verify authenticated health, immutable manifest registration, operation intent/query and restart observation. Do not update `current` during an active operation. A tool upgrade uses the same host journal and compatible wire protocol, under an idle/quarantined controller-owned maintenance boundary.
4. Verify an existing or explicitly authorized Tunnel + Access policy end to end, including service token headers and executor bearer authentication. The templates do not create or install a Tunnel, Access application or service token.
5. If authorized, install a checksum-verified native Mihomo binary separately from Docker. The secret provider imports nodes only; a subscription cannot override local ports/controller/rules. Persist the last known-good provider outside release preparation. Docker daemon, Git, BuildKit and Tunnel are different network clients; validate their actual registry manifest/blob/CDN paths independently. The initial daemon proxy change/restart belongs to the controlled migration window, not ordinary releases. No template weakens TLS or enables a LAN proxy/controller.
6. Transfer write ownership only after the controller and executor work and old automatic writers are fenced. Production acceptance and retirement of the old release path remain integrator responsibilities.

Required real installation facts are executor/Access credential references, verified Tunnel hostnames, actual project/container/volume identities, qualified configuration fingerprints, actual database schema/checksum capability profiles, compatible source/recovery image evidence, and the stable gateway's full preserved configuration. Notebook repository-mode adoption is implemented as `repo-adopted-image` below: it retains exact source evidence while selecting an existing qualified local Docker image. It does not build or push during cutover. Component-specific state/barrier helpers below avoid main-runtime PostgreSQL claims.

## Notebook and WuKongIM component controls

`component-control.mjs` implements fixed component controls directly in the adapter, with a standalone trusted-helper entrypoint for diagnostics. `deploy/release-host/components.example.json` is a policy fragment; every placeholder must be replaced with observed and reviewed facts. Component image profiles are keyed by actual Docker **config digest** and bind their independent protocol/storage contract, required capabilities, metadata hashes and permitted shutdown exits. A component contract uses `nativeSchema: 0` to avoid claiming the application's schema. Notebook RAG `productSchema` represents its actual RAG schema marker; WuKongIM can use zero when it has no separately observed numeric migration ledger.

Notebook's permitted update service is only `open-notebook`. SurrealDB belongs in `component.dependencies`, never in `hostPlan.images`; ordinary Notebook image updates do not stop or replace it. Every dependency's exact image, health, binary version and complete durable mounts are observed. This includes the original named `/home/nonroot` binding and the actual Docker names of anonymous `/data` and `/logs` volumes. A changed/missing/extra durable mount fails preparation before any service stop.

The Notebook helper queries the existing private SurrealDB `/sql` endpoint through its configured Docker network, using existing container credentials internally without logging them. Queries are fixed read-only statements: the RAG schema marker, unsettled command count, schema-definition fingerprint (`INFO FOR DB`), and an optional exact active generation pointer. Namespace, active/control database and expected definition/pointer identities are root-owned policy facts, never request selectors. It checks actual `/readyz` schema/profile and reviewed running source-file hashes. It never calls schema initialization, RAG shadow promotion, ingestion, model endpoints or an application migration.

For a changed Notebook artifact, the adapter closes only `rag-api` admission through the installed fixed Supervisor endpoint, waits for its own persisted commands to reach terminal states, then stops only the Notebook container. An unsettled command blocks replacement; no command is reset/requeued and no paid request is blindly repeated. The Surreal dependency and main Web/Workers stay running. Stopped-component observation requires an exact pre-drain metadata receipt tied to container ID, image ID and reviewed profile, plus fresh Surreal schema/mount evidence. Starting the cached replacement reopens its normal API/Worker processes; component `undrain` verifies that component and does not touch main ingress.

WuKongIM verifies actual retained `build-info.txt` hash, upstream commit, raftstore-fix commit, installed binary SHA-256 and `/readyz`, as well as the original WAL/data volume. Cold observation explicitly reports `coldSchemaInspected: false`; it relies on the previously observed exact writer identity and retained-volume compatibility evidence, rather than inventing a storage schema version. Storage/protocol changes across source, target or recovery profiles are rejected unless a separate qualified component migration adapter exists. Ordinary same-profile releases do not run PostgreSQL backup/barrier/migration or stop any main service.

Unchanged healthy component identities go through `prepare/drain/apply/verify/undrain` as no-ops with `noServiceChange: true`. Ownership and provenance can therefore be adopted without recreating the component. Recovery compares against its independent recovery image and uses the separate recovery phase keys.

For an existing Notebook repository deployment, set `hostPlan.sourceMode: "repo-adopted-image"` and use an explicit source/recovery identity:

```text
{kind: "local-qualified", ref: "sha256:<actual inspected Docker local ID>",
 localImageId: "sha256:<actual inspected Docker local ID>", localIdKind: "config|index|platform", diffIds: ["sha256:<actual ordered layers>"],
 os: "linux", architecture: "amd64",
 sourceEvidence: {mode: "repo", repository: "https://github.com/LingXi-Org/LingxiLoop.git", commit: "<exact40>"}}
```

These opaque local identities deliberately have **no** invented index/platform/config registry digest. The reviewed profile must repeat the explicit `localImageId`/`localIdKind`; index/platform kinds require the actual matching descriptor media type/digest. Whenever the registry graph is available, use the full registry descriptor/proof instead of an opaque identity. The root-owned image profile supplies the exact repository worktree and audited source-file inventory. Preparation checks its canonical origin, exact HEAD and clean tracked state; hashes `git show <commit>:<fixed path>` against the same file in the running container; and verifies the explicit actual local ID/type/platform/layers. The generated offline overlay references that existing image ID, preserving the original project/environment/volume bindings. No fetch, checkout, build, temporary repository write or push is performed. Retain that exact source audit under a release-owned read-only directory (for example `/opt/lingxi-release/source-audit/<commit>`) while it remains an allowed source/recovery image; retiring Komodo must not delete that evidence. An unchanged target can adopt that same local ID; a *new* target must carry full canonical registry qualification. Public artifact metadata should distinguish `identity: "local-image-config"` from registry identity when seeding the adopted component.

Existing repo-backed Compose must be image-bearing and pass the unchanged effective-configuration/volume checks; a `build` directive is rejected rather than silently building. This is an executable adoption path for a running audited image, not a claim that an arbitrary checkout can reproduce an unknown image. Missing source audit, actual schema/version, persistent mounts or compatible recovery profiles remains an exact qualification blocker.

## Validation

```text
node --experimental-sqlite --test scripts/release-host/*.test.mjs
RELEASE_HOST_DOCKER_TEST=1 node --experimental-sqlite --test scripts/release-host/database.integration.test.mjs
```

The optional Docker check requires the cached `pgvector/pgvector:pg16` fixture image and never pulls it. It only removes its own named fixture and tmpfs storage. Focused tests cover response loss, persisted key conflict, actual process exit after a side effect, restart observation without replay, partial unknown reservations, stale generations, online generation-zero preparation, source/recovery separation, cache/offline paths, original homes binding, schema/capability refusal, independent recovery keys, shared ingress concurrency/unknown reload, exact migration destination/checksum/final-exit checks, and cleanup errors independent of restore success.

Reference behavior: [Docker Compose single-service updates](https://docs.docker.com/reference/cli/docker/compose/up/), [fixed one-off migration execution](https://docs.docker.com/reference/cli/docker/compose/run/), [Docker daemon proxy configuration](https://docs.docker.com/engine/daemon/proxy/).

Image-store implementation reference: [Moby containerd inspect uses the target descriptor digest as the local image ID](https://github.com/moby/moby/blob/master/daemon/containerd/image_inspect.go). Host evidence must still prove the exact qualified graph, platform and layers; a release-note or version check alone does not qualify an image.

## Fixed gateway adapter

The `gateway` target has its own `policy.targets.gateway.gateway.imageProfiles` map, keyed by the independent config digest. Each profile binds a native/product-zero contract and `metadata: {version, versionOutputSha256, configurationSha256}` for the actual Nginx binary/effective `nginx -T` output. It does not use Notebook/WuKongIM or main-database profiles. The policy selects exactly one gateway service and its complete original mount inventory, which can legitimately be empty for the current image-baked configuration.

Preparation observes the running source using fixed `nginx -t`, `nginx -v`, `nginx -T` and loopback `/healthz`; raw configuration and diagnostics are hashed rather than returned. A changed cached image receives the same syntax/version/configuration checks in a restricted ephemeral `--pull never`, read-only, network-none preflight, without exposing ports or starting dependencies. The resulting image-level proof remains available if a new container exits before it can produce a readiness receipt. Application updates use only the gateway service with the common graph-proven local image identity and offline Compose flags. Independent drain/verify/restore phases do not stop the A/B applications, Workers, database, other B services or alter their ingress membership. A same-image healthy gateway is adopted without recreation.

Gateway readiness returns the observed configuration-mount fact and `hotDrainVerified: false`. An image-baked gateway with actual mounts `[]` does **not** thereby acquire hot-reload/backend-drain support. Installing an independently controlled read-only configuration-directory mount and proving the Nginx ingress driver's active-generation listener are separate cutover facts; the adapter never invents that mount or claims it is live. Configuration fingerprints must be updated through the reviewed policy when the effective gateway configuration intentionally changes.

## Preflight and pre-migration source restoration

Main-runtime `prepare` now verifies source-local readiness and its exact contract plus independent database state/checkpoint visibility and observable ingress before declaring preparation complete. Required controls must exist; ingress writer/observer share the authenticated endpoint and credential references. Drain repeats the independent preflight **before** its first Worker stop, so a missing/unreachable ingress cannot be discovered only after downtime starts. Recovery preflight uses independent controls without requiring a failed application to be alive; exact-source drain permits already stopped source containers while still requiring independent state/ingress evidence.

Only a known failure before migration/application/recovery intent may use `source-drain -> restore-source -> source-undrain`. These phases execute the preserved source overlay (`plan.source ?? plan.recovery`), not a recovery image that may support only a future schema. The host checks every target in its local journal for this manifest and rejects source restoration if any `migrate`, `apply` or `recover` intent exists, regardless of its outcome. It checks fresh exact source schemas/runtime/checksums and capability compatibility before source actions and each source side effect. The environment controller must enforce the corresponding condition across hosts; a local host journal does not assert remote intent absence. Unknown operation reservations continue to block new writes. Source ingress phases have independent fixed keys in the Nginx adapter.

Compiled backup/isolated-restore helpers can identify a finite set of known pre-migration/read-only failures (for example a rejected archive upload or explicit size/policy rejection), with an explicit known-outcome marker. The executor records that step as `failed-known` and preserves the original failure, permitting the separately guarded source path. Driver disconnects, uncertain uploads, unknown subprocess results and migration effects remain uncertain and retain reservations; they are never converted to known failures to enable rollback.
