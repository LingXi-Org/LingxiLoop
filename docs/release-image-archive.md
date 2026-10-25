# Private image archives for release candidates

When `RELEASE_CONTROLLER_ENABLED=true`, each changed image is published to GHCR
and qualified by its exact raw OCI index, linux/amd64 manifest and config bytes.
CI then pulls that immutable digest and saves exactly one tag:
`localhost/lingxi-release-cache:sha256-<configDigest hex>`.
The ordinary disabled-controller publish and deployment paths are unchanged.

For first adoption, configure `RELEASE_API_URL` and the existing submission
secret, keep `RELEASE_CONTROLLER_ENABLED` disabled, and dispatch the existing
main-branch workflow with `publish_only=true` and the required image scope.
That explicit mode also stages the verified R2 archives and metadata before
accepted inventory exists. It does not register a candidate or deploy services.
An unconfigured API or a non-main publish-only run does not enter this bootstrap
path. Ordinary push behavior is unchanged, so initial artifact preparation does
not require prematurely enabling automatic releases.

`scripts/release/image-archive.mjs` streams Docker's standard image archive
through gzip into a mode-0600 file under `RUNNER_TEMP`. It bounds the gzip at
8 GiB and its uncompressed archive at 16 GiB. The Python standard-library
validator reads without extracting files, verifies the complete gzip SHA/size,
exact config bytes against `configDigest`, linux/amd64 rootfs and every ordered
layer's actual uncompressed SHA against `diffIds`. It requires one manifest
image and the exact safe tag, rejects unsafe or duplicate outer archive paths,
links/devices, extra image/tag metadata and nonzero trailing data. It supports
ordinary uncompressed layer members and gzip layer blobs.
When the save includes an OCI `index.json`, its unique descriptor must bind the
actual manifest blob SHA/size, exact source config, and every ordered layer blob's
actual SHA/size and uncompressed diff ID. Unknown or mismatched layouts fail
closed. The observed Docker 28.4.0/vfs save already uses this OCI blob layout;
support does not rest on a legacy-path assumption.

Only after local validation does CI read sequential parts of at most 8 MiB and
upload them using the existing submit-only `RELEASE_API_TOKEN`:

```
HEAD /v1/artifact-blobs/<part SHA256 hex>
PUT  /v1/artifact-blobs/<part SHA256 hex>
```

The independent root `RELEASE_API_URL` must be HTTPS without URL credentials,
path prefixes or query parameters. Tokens travel only in Authorization headers;
redirects are rejected. HEAD qualifies `Content-Length` and
`x-lingxi-artifact-sha256: sha256:<hex>`. PUT carries the exact length and raw
bytes, and requires the API's `{complete:true,sha256,size}` receipt. A lost
response, unreadable receipt or server error is reconciled once by HEAD.
Authentication errors, client errors and hash/size conflicts fail immediately.
An unconfirmed write never triggers another PUT in that invocation.

The private R2 object key is `artifact-blobs/sha256/<part hex>`. The API verifies
actual SHA256 and makes each key immutable. API/administrator roles can submit;
the controller reads through its private R2 binding and relays parts to the host
through the existing authenticated Tunnel. The executor does not contact GHCR.
CI receives no executor or administrator credential. This module neither
changes Worker authorization nor grants CI GET access.

The original OCI identities and raw proof remain in each image artifact; CI adds:

```json
{
  "archive": {
    "version": 1,
    "format": "docker-save+gzip",
    "sha256": "sha256:<complete gzip SHA256>",
    "size": 123,
    "uncompressedSize": 10240,
    "tag": "localhost/lingxi-release-cache:sha256-<config hex>",
    "parts": [{"sha256": "sha256:<part hex>", "size": 123}]
  }
}
```

There are at most 2048 ordered parts and their positive sizes sum exactly to
the gzip size. CI rehashes the whole file during upload and writes metadata only
after every part is confirmed. GitHub Actions uploads only `artifact.json`;
the archive never enters the GitHub artifact directory. Temporary archives and
the temporary Docker tag are cleaned after completion or failure. An interrupted
run may leave immutable R2 parts; this change adds no deletion or GC policy.

The executor must independently verify the archive and its source identities
before loading. A Docker load is not evidence that the original registry
`RepoDigests` survive. The root controller and host loader own receipt validation,
download authorization and safe load; this CI module does not bypass them.

Validation: `node --test scripts/release/image-archive.test.mjs` covers part
boundaries, HEAD reuse, lost-response reconciliation, denial/conflict handling,
raw-proof binding, archive content checks and CI gating. The opt-in
`LINGXI_ARCHIVE_REAL_DOCKER=1` runs an isolated local Unix-socket import/tag/save
fixture without starting containers or accessing a registry. The development
check passed with Docker **28.4.0**, linux/amd64, **vfs**, and verified actual
saved config/layer bytes; only that fixture's two tags were removed. Production
Docker 29 and real registry→CI→R2→host delivery remain separate deployment checks.
The previously observed host-to-release-API HTTP 403 is an unresolved deployment
blocker, and these local tests do not establish production delivery.
