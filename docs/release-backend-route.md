# Prepare the independent B backend origin

`backend-route.py` is a bounded host module for the existing B
`server-b-ingress` Traefik. It accepts JSON stdin with only `action` (`query` or
`apply`) and, for apply, `expectedHash`. It accepts no file path, hostname,
command, URL, credential, TLS setting or arbitrary configuration from a remote
caller. This module has not been executed against production.

The fixed file path was confirmed by the already captured B inventory:

```
/etc/komodo/stacks/server-b-ingress/deploy/komodo/server-b-ingress/dynamic.yml
```

Every query/apply independently rechecks the running Docker container's exact
Compose project/service/working-directory/config-file labels, the
`lingxiloop-traefik` name and the actual read-only single-file bind to
`/etc/traefik/dynamic/routes.yml`. It requires the existing watched file
provider, and compares host bytes and inode with container readback/stat. A different path,
mount, source inode view, missing running container or unsupported layout fails
closed. The saved inventory alone is not permission to skip the live check.

Query is read-only and returns host/mounted SHA-256, the current backend router
if present, the planned router/hash, actual mount/container identity, file-watch
configuration and any durable intent. It writes no state or backups. Apply
requires root and the exact current `sha256:<hex>` source hash from a freshly
reviewed query.

The sole configuration change inserts router `backend` with
``Host(`backend.lingxilearn.cn`)`` under the current `http.routers`, pointing to
existing `gateway`. Its entry point, certificate resolver, middleware and other
router options are cloned verbatim from the existing qualified `loop` router;
only router name and exact Host value change. Every pre-existing router and
service byte stays intact, including line endings. Conflicting duplicate or
nonmatching backend rules are rejected. The gateway and its HMAC/session/
webhook authorization behavior are not changed, and the public loop Host rule
is not switched.

## Durable write and verification

Apply acquires a local lock under `/var/lib/lingxi-release/backend-route`,
creates a fsynced **0600** exact original-byte backup, and persists an intent
with original/target hashes and device/inode identity before writing. The
configuration file is written and fsynced **in place**, keeping its inode and
mode. Atomic rename is intentionally not used for this single-file bind;
replacing the pathname could leave Traefik mounted on the old inode. Atomic
metadata-file replacement is used only for the separate private intent.

Verification reads back the mounted bytes and checks the original inode. It
then performs a bounded local curl to `127.0.0.1:443` using the existing
`loop.lingxilearn.cn` SNI/certificate and the exact HTTP
`Host: backend.lingxilearn.cn`, requesting only the gateway's public `/healthz`
and requiring 204. Certificate/CA verification stays enabled; there is no
`--insecure`, shared Traefik restart or TLS/daemon/security configuration edit.
The existing loop health is confirmed first. The small retry window allows the
existing file watcher to observe the edit.

A definite HTTP verification failure rolls back only if our target bytes and
inode still own the file. Original bytes are restored through the same inode,
fsynced, checked through the mount and checked against existing loop health.
A transport timeout, changed file/inode, uncertain write/readback or process
crash leaves the intent in place and prevents automatic replay. Query can show
its observed state and `needsAgent`; a new apply will not reinterpret an
unfinished write as permission to repeat it. A fully accepted matching receipt
can be read/reused without changing the file.

Successful local routing is not proof that backend DNS, a new public TLS
certificate, the auth Worker's independent `ORIGIN_BASE_URL`, tenant/HMAC
requests, WS/SSE or the complete public entrance have passed acceptance. Those
remain explicit integration checks owned by the primary release operator.
This module only prepares an independent origin route; it does not cut over
the public loop entrance or touch other projects.

## Tests

`node --test scripts/release/bootstrap-host/backend-route.test.mjs` runs the
Python isolated fixture suite. Tests verify source-hash and live mount checks,
byte preservation for LF/CRLF, original inode and backup mode, exact rollback,
unknown-result retention, crashes after intent/side effect, and router conflicts.
All Docker/curl calls are mocked; no production command, restart, TLS change or
business request was performed during implementation.
