# Fixed private bootstrap distribution

The release Worker module `bootstrap-artifact.ts` has exactly two catalog
entries, exported as the frozen `BOOTSTRAP_PATHS` list for the API entry:

| Exact API path | Private R2 key | Official bytes | Fixed SHA-256 |
| --- | --- | --- | --- |
| `/v1/bootstrap/cloudflared/2026.10.3/linux-amd64` | `bootstrap/cloudflared/2026.10.3/linux-amd64` | 40,227,721 | `053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0` |
| `/v1/bootstrap/mihomo/v1.19.33/linux-amd64-compatible.gz` | `bootstrap/mihomo/v1.19.33/linux-amd64-compatible.gz` | 22,893,972 | `386508bfb1c72c43b6a0eda73708ecdce82546581b0ebcb16366c53757c622b6` |

Original cloudflared constants remain compatible. Each object and upload must
have a positive actual size no greater than 64 MiB (67,108,864 bytes), a matching
actual R2 checksum and its catalog's fixed SHA metadata. No arbitrary version,
key, upstream URL, query selector or proxy endpoint is accepted. The `.gz`
Mihomo artifact is delivered unchanged, not transparently decompressed.

The API entry must authenticate before calling `handleBootstrapArtifact`:
only the existing administrator token may PUT, and only administrator or
executor tokens may GET/HEAD. The CI API token must be rejected. The module is
an internal handler and does not authenticate independently. Its integration
must return/await the handler inside the API's existing error boundary, before
any JSON-only content-type guard.

The producer first downloads the official public binary and verifies its fixed
SHA-256. ADMIN PUT then requires `application/octet-stream` and an exact
positive `Content-Length`. `FixedLengthStream` enforces the declared size,
while R2 validates the hardcoded SHA-256 on the actual uploaded stream.
Conditional `etagDoesNotMatch: '*'` prevents replacement, and the same write
sets `customMetadata.sha256`. This uses the R2 Worker binding rather than
assuming that an undocumented REST header can set custom metadata.

An existing object is reused only when its R2 SHA-256 checksum, custom metadata,
actual size and fixed key qualify. A mismatch fails without overwrite. A lost
PUT response is uncertain: reconcile with authenticated HEAD instead of
blindly uploading again. There is no new credential or general object-upload
capability. Both role enforcement and actual production upload remain owned by
the release API integrator.

GET returns the R2 body stream directly with the exact length and checksum
header. HEAD returns the same qualification headers and no body. The module
does not buffer an entire executable, issue signed download URLs or put a
secret in a URL. Responses use private/no-store/no-transform caching and
identity encoding. This bounded version serves full objects and does not
advertise byte-range support. The host must independently verify the fixed
SHA-256 before installation.

## Isolated verification — 2026-10-25

The parent-provided official files were independently checked:

- `/workspace/scratch/cloudflared-2026.10.3-linux-amd64`: 40,227,721 bytes and
  the fixed cloudflared SHA above.
- `/workspace/scratch/mihomo-linux-amd64-compatible-v1.19.33.gz`: 22,893,972
  bytes and the fixed gzip SHA above.

A temporary loopback fixture server exposed only those two files to the
existing isolated workerd test pool; no production endpoint or bucket was
contacted. All **11** targeted tests passed, including real R2 PUT, streamed
GET SHA-256 verification, HEAD and duplicate reuse for **both actual official
artifacts**. They also cover catalog/version/platform/checksum substitution,
real wrong-checksum and truncated-body rejection, fixed path/size qualification
and response-loss reconciliation. No digest was replaced for a positive test.
Metadata contract tests explicitly label synthetic bodies and do not claim
they are fixed-digest binary preimages.

The optional real-artifact tests use
`VITE_BOOTSTRAP_ARTIFACT_FIXTURE_URL` at an approved local `127.0.0.1` fixture
path `/cloudflared`, and `VITE_BOOTSTRAP_MIHOMO_FIXTURE_URL` at `/mihomo`. They
are skipped when those local fixture URLs are absent in routine CI.

The installed test workerd reports fallback from compatibility date
2026-09-01 to its supported 2025-12-17. The truncated-body rejection emits the
runtime's fixed-length disconnect diagnostic; the request is rejected and no
successful object remains. No Docker setting, host service, network-security
configuration, production deployment or new credential was changed here.
