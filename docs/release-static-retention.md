# Bounded retained-asset requests

`release-static.mjs inventory` retains the same hashed assets at the same R2
keys, using three asset jobs rather than one. Every GET and PUT starts through
one process-wide gate with at least350ms between starts. Bodies can overlap;
there are at most three active asset jobs. The separate `record` command also
uses that pacing for its requests. No new credentials, API surface, quota or
retry mechanism are introduced.

Cloudflare documents a1200-request/five-minute Cloudflare REST API limit for
[R2 operations](https://developers.cloudflare.com/r2/platform/limits/#cloudflare-rest-api),
alongside the cumulative user/account and IP limits in its
[general API limits](https://developers.cloudflare.com/fundamentals/api/reference/limits/).
This process starts at most about858 requests/five minutes. Other processes and
API consumers still share the service limit, so this is not an account-wide
quota guarantee.429,401,403 and all other failures stop new dispatch; there is
no automatic retry or attempt to bypass a limit.

Existing objects still require a full GET and actual byte-hash equality before
reuse; a conflict issues no PUT. A missing object still uses one GET plus one
PUT. Redirects remain forbidden and each request retains its20-second timeout.
The first failure is retained while all already in-flight jobs finish. Even a
queued PUT cannot start after another job's failure. Request/body failures and
hash conflicts do not include URLs, object keys or credentials in errors.
Progress contains only completed/total asset counts, printed every50 completions
and at the start/end.

Inventory bytes, file ordering, licenses, effective variables, artifact hash and
configuration-version calculation are unchanged. A local CLI fixture compares
the entire inventory.json byte-for-byte and requires three overlapping reads;
the original serial implementation fails that fixture. Additional owning tests
cover pacing, request counts, concurrency bounds, failure draining, immutable
reuse/conflicts, denial handling, redirection and sanitized errors:

```
node --test scripts/release/static-*.test.mjs scripts/release-candidate.test.mjs
```

For1126 entirely retained assets,1126 GET starts need at least about6.6 minutes
at this cadence. For1126 entirely new assets,2252 GET/PUT starts need at least
about13.1 minutes, before remaining body/runner overhead. Small concurrency
overlaps latency; it cannot remove that pacing floor. The release owner must
choose any future CI time budget from real cold/warm observations. This change
does not edit workflow deadlines, cancel/retry jobs, upload Workers or deploy.
