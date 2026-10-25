# Private release backup archive

The archive helper stores a final, drained PostgreSQL backup in private R2
before the fixed migration adapter proceeds. The local dump is retained on
success and failure. This is a single-object first version with a hard limit of
90 MiB (94,371,840 bytes), not a multipart/large-backup implementation. Larger
backups fail with `ARCHIVE_TOO_LARGE` and remain local; migration must not proceed
without a confirmed archive receipt.

## Controller boundary

The fixed route is `/v1/releases/:id/backups/main-runtime-a`. The release API
must authenticate its existing `EXECUTOR_TOKEN` before fetching the private
release record and calling `handleArchive(request, env, record)`. This helper is
not an independently exposed public handler. It requires the same immutable
manifest hash, execution generation, an `active` or `recovering` release and an
explicit runtime-A maintenance database plan.

All requests supply `x-lingxi-generation` and `x-lingxi-manifest-hash` headers.
POST additionally requires `Content-Type: application/octet-stream`, an exact
positive `Content-Length` within the limit, and `x-lingxi-dump-sha256` formatted
as `sha256:<64 lowercase hex>`. A `FixedLengthStream` enforces declared size and
provides R2 a known upload length. The Worker streams the dump directly to R2
with the optional `sha256` hexadecimal checksum parameter and conditional
`etagDoesNotMatch: '*'`; R2 validates the actual body checksum before making the
object available. No complete backup is buffered in the Worker heap.

The fixed private object key is:

```
releases/<releaseId>/backups/main-runtime-a/database.dump
```

The object metadata binds manifest hash, generation, dump hash and size. A
sidecar at `database.dump.receipt.json` is independently checksum-validated and
conditionally immutable. Same-key differing bytes or receipt hashes are
rejected. A crash between the dump write and receipt write remains observable:
GET/HEAD inspect the dump's R2 checksum/metadata; a matching repeated POST can
finish the missing sidecar. A conflicting existing sidecar is never silently
repaired or replaced.

GET returns only `{version, releaseId, target, generation, manifestHash,
dumpHash, size, key, complete, bodyHash}`. `bodyHash` is SHA-256 of the UTF-8 JSON
of the other fields in their fixed order. HEAD returns hash/size/receipt-hash
headers and an empty body. Neither method returns dump bytes, signed download
URLs or credentials. Responses use `Cache-Control: no-store`. Restore access is
a separate explicitly authorized operations action; this route cannot download
the archive.

## Trusted host policy

`uploadArchive(policy, op, {dumpPath, dumpHash})` reads only trusted
`policy.archive.baseUrl` (an HTTPS root URL without credentials/query/fragment)
and `policy.archive.tokenFile` (an absolute existing executor-token file).
Optional `timeoutMs` defaults to 60 seconds, bounded at five minutes. The target
is fixed to runtime A and the only permitted local path is:

```
<policy.stateDirectory>/<releaseId>/database/backup.dump
```

The dump path is supplied by the fixed database helper, never a remote request.
The helper verifies file size and local SHA-256, then reads the token from the
policy's file. Secrets appear only in the Authorization header; no URL query,
argv, log output or response contains them. The module only exports helpers and
has no arbitrary-command CLI.

`observeArchive(policy, op, {dumpPath, dumpHash})` performs only the metadata
read. A missing object fails with `ARCHIVE_NOT_CONFIRMED`; it cannot POST. Use
this helper for resumed backup observation and immediately before migration.

The uploader first queries metadata and reuses an exact checked receipt.
Otherwise it POSTs the file with a Node stream, `duplex: 'half'`, redirect
rejection and a bounded timeout. A timeout, lost response or server error leads
to one fresh metadata query. A confirmed exact receipt completes the operation;
missing/unavailable evidence produces an uncertain failure, with the local dump
preserved. There is no blind POST retry. A later resume starts by checking R2
metadata again.

The controller integration must put this route before the normal JSON-only
release API guard and retain executor-only authentication. The fixed host
migration helper must require a confirmed receipt before migration. Existing
private R2 binding, executor token and trusted policy paths are reused; this
module does not create credentials, expose a bucket or alter production state.

## Validation and remaining boundary

`workers/release/src/archive.test.ts` uses the actual isolated workerd R2
binding, including streaming checksum checks, conditional write races, invalid
length/checksum, fencing, size rejection and receipt conflicts.
`node --test scripts/release-host/archive.test.mjs` covers streaming HTTP calls,
exact receipt reuse, lost-response reconciliation and local backup retention.
The current test workerd supports compatibility date 2025-12-17 and reports its
fallback from the repository's 2026-09-01 configuration; no newer runtime
behavior is claimed by those tests.

No production archive, real backup duration, restoration exercise or large
backup support is established by these isolated tests. Bucket access and
retention policy, actual backup size, migration integration and a real
archive/restore receipt remain production acceptance evidence.

R2 checksum and conditional-write behavior follows the [Cloudflare Workers API
reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
