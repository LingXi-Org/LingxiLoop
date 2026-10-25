# Private R2 container artifacts

The release pipeline can distribute container images without a host registry
connection or a working Mihomo subscription. R2 is private; a URL is never
passed to `docker pull`.

The CI producer pulls the pinned GHCR image on the runner, preserves its raw OCI
index/platform/config proof, assigns the single fixed cache tag, and exports a
`docker save` tar compressed with gzip. It verifies the raw config checksum and
the ordered uncompressed layer checksums before uploading 8 MiB parts. Archives
stay in the runner's temporary directory; only image descriptors belong in the
GitHub release artifact.

Each image descriptor may carry an `archive` object:

```json
{
  "version": 1,
  "format": "docker-save+gzip",
  "sha256": "sha256:<whole compressed archive checksum>",
  "size": 12345,
  "uncompressedSize": 20480,
  "tag": "localhost/lingxi-release-cache:sha256-<config checksum hex>",
  "parts": [{ "sha256": "sha256:<part checksum>", "size": 12345 }]
}
```

The protocol bounds compressed archives to 8 GiB, uncompressed tars to 16 GiB,
and descriptors to 2,048 parts. The existing manifest request limit and
Cloudflare Workflow execution limits also apply; these are upper safety bounds,
not an assertion that every combination fits an execution budget.

`/v1/artifact-blobs/<64 lowercase SHA-256 hex>` accepts only immutable,
checksum-validated objects under `artifact-blobs/sha256/`. It cannot address
database backups or other R2 keys. The submission token can PUT and HEAD parts;
only executor/admin tokens can GET bytes. The response checksum header is
`x-lingxi-artifact-sha256: sha256:<hex>`. Existing objects must match both the
checksum and declared length. After a lost PUT response, callers HEAD before
considering another PUT. A 401/403 or checksum conflict is terminal.

The Workflow uses the R2 binding to relay each part through the existing
authenticated host Tunnel and Access service token. This requires a verified
connector; it does not change or bypass an outbound Cloudflare deny. Every
part has a separate durable step. Before a write, and after an uncertain reply,
the controller reads the host's artifact status. A verified local image skips
R2 reads and uploads. This transport uses the existing token roles and bucket,
without public access or additional persistent credentials.

The host accepts only parts referenced by a registered manifest and hashes
them before acknowledging durable storage. Before switching services, it must
validate the complete gzip/tar and load the archive offline, then verify the
daemon's actual image identity. An archive tag alone is insufficient evidence.
The source and compatible recovery images must also be available before
business traffic is drained. A host policy with `artifactTransport: "r2"`
prohibits registry pulls when the required cache is missing.

At the implementation checkpoint, subscription reads from two cloud
environments returned upstream-connect HTTP 503, and the bounded same-origin
Cloudflare fetch returned HTTP 526. No valid node configuration was obtained.
Mihomo and Docker proxy settings remain inactive. This establishes the reason
for selecting the authorized R2 transport; it does not establish permanent
subscription failure or a successful production release. Host A's outbound
release API 403 remains a separate unresolved security diagnostic.

See Cloudflare's [R2 checksum API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#checksums)
and [Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/).
