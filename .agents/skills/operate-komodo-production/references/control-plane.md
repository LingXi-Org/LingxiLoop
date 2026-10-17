# Control-plane maintenance

Use for authorized bootstrap, outage recovery and host migration. It does not authorize deploying product stacks through SSH.

## Current installation

Control-plane migration was accepted on 2026-10-17. Core/MongoDB, keys and backup history run on txy3; cold-copy checksums matched. DNS points to txy3, public HTTPS and the original API credentials work, all three active agents are connected, and all eight product stacks are running. A `Backup Core Database` procedure executed through the public API completed successfully and wrote a new backup on txy3. Historical blocked-port evidence remains in the migration artifacts; it is no longer a current blocker.

- Host: `txy3`, SSH `root`, `49.232.41.248`; Komodo Server name `manager`.
- Reviewed manifests: `deploy/komodo/core/` and `deploy/komodo/control-ingress/`.
- Host copies: `/opt/komodo/bootstrap/core/` and `/opt/komodo/bootstrap/control-ingress/`.
- Core/Mongo containers: `komodo-core-1`, `komodo-mongo-1`; ingress: `komodo-traefik`.
- Persistent state: `komodo_mongo-data`, `komodo_mongo-config`, `komodo_keys`, `control-ingress_traefik-acme`, and `/etc/komodo/backups`.
- Core binds `127.0.0.1:9120`; Mongo has no published port. Only Traefik publishes 80/443. No Docker socket is exposed to Core or Traefik.
- Periphery: `/usr/local/bin/periphery`, `/etc/komodo/periphery.config.toml`, `periphery.service`; outbound TLS to `https://ops.christmas1314.xyz`, `connect_as = "manager"`, inbound listener disabled.
- Core and Mongo image digests are pinned to the migration source versions. Pull those exact images through the registered accelerator before creating containers.
- Retired source: aly's Core/Mongo containers are stopped with restart policy `no`; `periphery.service` and its Komodo Server record are disabled. Its original data and keys remain for rollback. Original ingress manifests are in `/opt/komodo/rollback-20261016/`; live aly ingress serves only wegolibrary. A decommissioned aly must not become a prerequisite for future releases.

## Validate or recover txy3

Read host service/container status and compare installed manifest hashes before changing anything. A stopped, intact installation normally needs only `docker start`/`restart` for the exact affected bootstrap container, or `systemctl restart periphery`; these preserve the existing runtime environment.

For reviewed Compose changes or recreation, copy only the reviewed non-secret manifests to the host paths above. Resolve the Sigillo project/environment, then use [bootstrap.cjs](../scripts/bootstrap.cjs):

```powershell
npm exec --yes --package=sigillo@0.14.2 -- sigillo run -p <project-id> -c prod -- C:\nvm4w\nodejs\node.exe .agents\skills\operate-komodo-production\scripts\bootstrap.cjs validate core
npm exec --yes --package=sigillo@0.14.2 -- sigillo run -p <project-id> -c prod -- C:\nvm4w\nodejs\node.exe .agents\skills\operate-komodo-production\scripts\bootstrap.cjs validate control-ingress
```

`create` creates stopped containers for a restore. `up` starts/reconciles the named bootstrap project; it refuses to start Core without existing MongoDB data and the Core private key. Both use `--pull never` so a missing pinned image fails visibly. The helper accepts only `core` and `control-ingress` on `txy3`, uses batch SSH with normal host-key checks and sends only required environment variables as JSON on stdin to Python. It does not persist credentials in an env file or command arguments. The ACME contact defaults to `no-reply@lingxilearn.cn`. The destination certificate volume is external and must be restored before starting ingress.

The manifests intentionally live outside product `resources.toml`: Core must remain recoverable while the Komodo API is down, and a product rollout must not replace the control plane that is executing it.

If public ingress is unavailable, an authorized operator can inspect the local HTTPS API over SSH with `curl --resolve ops.christmas1314.xyz:443:127.0.0.1`. Keep TLS certificate verification enabled and supply authentication headers through stdin from a Sigillo child, never shell arguments or files. This proves only the local control plane; it does not prove public availability or agent connectivity.

## Moving Core to another host

Adapt host-bound helper code only after inspecting the requested new target. Do not treat this reference as permission for an unrequested migration.

1. Inventory source containers, volumes, backup path, scheduled procedures, agents, stack IDs/images, webhook configuration and DNS. Identify unrelated services and shared ingress dependencies. Resolve DNS from an authoritative/public resolver or a remote host; local proxy fake-IP answers are not origin addresses.
2. Prepare Docker, the exact source image versions, reviewed manifests and a **fresh** Periphery identity on the destination. For onboarding, use a short-lived non-privileged key held only in process memory, verify the server name/IP, revoke the onboarding key and run the agent under systemd. Retain the old host as a distinct server if it still serves another application.
3. Separate destination control ingress from any source application ingress. Transfer only the required TLS certificate/ACME account and Core key material using encrypted host-to-host streams; no secret-bearing local archive or command output. Preserve ownership and restrictive file permissions. Verify external 80/443 reachability and HTTPS using `curl --resolve` **without disabling certificate verification** before taking the source down.
4. Verify that the DNS account is available and the exact record can be changed. For `ops.christmas1314.xyz`, change only its Alibaba DNS A record to the new IP; keep `golib.christmas1314.xyz` on aly. Do not attempt this with a Cloudflare token. If login is needed, request it while finishing independent preparation; do not start an outage while access is unresolved.
5. Wait for active Komodo operations to finish. Run `BackupCoreDatabase` through the API and require a terminal successful update. Stop source Core to prevent concurrent writes, then cleanly stop Mongo. Preserve a rollback copy. Copy the **stopped** Mongo volumes, Core keys and backup history through encrypted streams into empty destination volumes. Do not copy live WiredTiger files.
6. Start destination Mongo/Core, require the original API credentials to work and compare resource IDs/counts. Keep the source Core/Mongo stopped. Change the authoritative DNS record once the new origin is ready, then verify DNS propagation and agent reconnection. Domain, API credentials, signing secret and procedure IDs remain stable, so Worker/CI callers need no redeployment.
7. Check all managed servers and product stacks, compare image inventories, and run a narrow control operation such as `BackupCoreDatabase` or the backup procedure. Require its successful terminal update and new backup files on the destination. Test the public control URL, product route and any preserved source application route.
8. Disable restart policies for retired source Core/Mongo. Remove the old Komodo route/network dependency from aly's ingress only after DNS cutover is verified. Keep stopped source data and rollback manifests unless deletion was specifically requested. Never run `down -v` or global prune.

If the operator has already switched DNS and will fix cloud ingress separately, complete the authorized durable-data migration and verify the local authenticated HTTPS API and a successful backup update. Report public HTTPS and agent reconnection as pending until tested; do not replace TLS with HTTP or work around cloud ingress restrictions using product deployment tunnels.

If validation fails before cutover, keep the source authoritative. After cutover, avoid rolling back to a stale database: stop new writes, assess changes and transfer current state back if needed before changing DNS. A rollback must leave exactly one writable Core.

If rollback needs aly's agent, explicitly re-enable its Komodo Server and systemd service after restoring the authoritative Core. Do not revive retired services just because the legacy Server is disabled. Migrating Core does not migrate wegolibrary; aly shutdown will affect that separate application unless separately moved.

## Completion evidence

Save sanitized before/after inventories and update IDs, DNS A/AAAA answers, certificate-validated HTTP status, destination service/restart state, and checks that the old Core is stopped and unrelated services remain healthy. Do not save raw environments, database dumps, private keys or full API resources as local evidence.
