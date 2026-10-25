# Private image archive cache

Trusted local policy selects `artifactTransport: "r2"`. The default remains
`registry` for existing installations. R2 mode never pulls, builds, tags or
contacts a registry. Forward/recovery images missing from strict local cache
require a registered `image.archive`; source images without an archive must
already pass the existing local identity checks.

The same executor Bearer credential protects two finite routes:

* `POST /artifact-status`, JSON `{releaseId,target,manifestHash,configDigest}`.
  The exact immutable registered manifest selects the archive. The reply binds
  `archiveSha256` and `configDigest`, and returns `imageReady`, `receivedParts`,
  `missingParts`, and `loadState`. For an already qualified complete image the
  two part arrays are empty. Otherwise the arrays partition every part index.
* `PUT /artifact-parts`, `application/octet-stream`, with headers
  `x-lingxi-release-id`, `x-lingxi-target`, `x-lingxi-manifest-hash`,
  `x-lingxi-config-digest`, and decimal `x-lingxi-part-index`. No client path,
  URL, SQL or command is accepted. Query status after any missing response.

The archive contract is version 1, `docker-save+gzip`, with a complete compressed
SHA-256, compressed/uncompressed sizes, the only permitted tag
`localhost/lingxi-release-cache:sha256-<configDigestHex>`, and ordered part
SHA-256/size records. Limits are 8 MiB per part, 2048 parts, 8 GiB compressed,
16 GiB tar and expanded layer content. Bounded metadata limits are 4096 members,
2 MiB per JSON metadata file and 64 MiB total captured metadata. The original raw
OCI index/manifest/config proof remains mandatory and independently verified.

The cache uses only private executor-owned files under
`stateDirectory/artifacts/<compressedSHA>/`. Parts commit by exclusive temporary
file, SHA/size validation, fsync, rename and directory fsync. A private durable
part receipt binds its expected identity and dev/inode/size/mtimeNs/ctimeNs.
Status uses these metadata stamps; a missing receipt or changed stamp triggers
one fresh part hash and stable-stat check. Corrupt committed files are refused,
never overwritten. An assembled archive is always hashed byte by byte again.
One executor process owns the existing kernel flock; in-process per-archive
locks prevent concurrent upload/load writes. Part uploads have a 60-second
deadline. Docker load/save have fixed 15-minute limits.

Before loading, preparation checks free space for compressed size plus twice
the declared tar size and 64 MiB margin. It streams gzip and tar without
extracting files: checks outer tar checksums, padding, bounded expansion,
duplicate members, safe fixed names, and rejects outer links or traversal. It
requires exactly one `manifest.json` image and fixed tag, exact raw config SHA
matching the OCI config blob, and ordered raw/uncompressed layer hashes matching
the OCI diff IDs. OCI-layout exports additionally require the single tagged
index/manifest chain and content-addressed blobs. Known Docker classic v1
compatibility metadata has an explicit bounded shape. Unknown shapes fail
closed. Normal filesystem links inside Docker image layers remain Docker's
rootfs format; the host helper does not extract them.

A private fsynced load intent precedes fixed
`docker image load --input <cachePath>`. Any lost result remains uncertain.
Restart/status never repeats a load intent: it inspects the fixed tag and
performs only an offline `docker image save --output <privateReadbackTar>
--platform linux/amd64 <fixedTag>` (or the qualified arm64 platform). The daemon
export must independently prove the same raw config, ordered layers and single
tag. Inspect before/after must agree on local ID, descriptor and configuration.
Only then is a private completed identity receipt committed. This supports
Docker stores that regenerate manifest/index IDs or lose RepoDigests on load;
the original registry identity verifier remains strict. Component, migration,
source and readiness resolution use the same completed receipt. A matching tag
by itself never qualifies an image. Readback temporary tar is removed only
after the completed receipt is durable; uncertain evidence is retained.

The receipt binds the complete canonical OCI image identity, independently of
tar/gzip packaging. An identical image can reuse a completed receipt from an
older archive SHA. Status still echoes the requested archive SHA; the nested
identity retains the actual earlier archive SHA and does not claim that the new
package was downloaded. A changed canonical ref or OCI graph cannot use this
transport-only reuse.

Tests:

```sh
node --experimental-sqlite --test scripts/release-host/artifact-cache.test.mjs
RELEASE_HOST_ARCHIVE_FIXTURE=/path/to/producer-fixture node --experimental-sqlite --test scripts/release-host/artifact.integration.test.mjs
```

The opt-in integration performs a real local Docker load/save using the
producer's fixture and retains its original files/tag. Its synthetic OCI graph
is an offline interoperability fixture, not evidence of a published image.
Docker 28.4.0/linux/amd64 was exercised locally; Docker 29 ID changes are covered
by a simulated daemon boundary and still require production qualification by
the designated integrator. No production execution is part of this module's
development verification.
