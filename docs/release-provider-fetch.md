# Administrator-only fetch of the approved Mihomo provider origin

`provider-fetch.ts` implements only
`POST /v1/bootstrap/mihomo/provider-fetch`. Its request is JSON `{url: string}`
with a hard 16 KiB actual byte limit and no additional keys. The URL must use
HTTPS, have no userinfo/fragment or raw control/whitespace characters, and the
SHA-256 of its normalized `URL.origin` must match the existing private
`MIHOMO_ORIGIN_SHA256` binding. Default HTTPS ports and hostname case are
normalized by `URL`; a different scheme/host/port cannot reuse that guard.

The API entry must authenticate the existing ADMIN token before invoking
`handleProviderFetch`. CI and EXECUTOR tokens must not reach this handler.
The module neither declares a new credential nor authorizes callers itself.
The binding is the hash of the user-approved Sigillo origin; the actual secret
subscription URL is accepted only in the TLS-protected JSON body, never in the
API URL, a log, metadata or a stored object. The module does not expose a
caller-selected origin guard or a general proxy.

Exactly one GET is made to that original guarded subscription URL with manual
redirect handling and a 20-second request deadline. No Authorization, cookies,
Origin or other incoming request headers/body are forwarded. There is no retry,
identity replacement or redirect follow, even within the same origin.

A 3xx response becomes a sanitized redirect error containing only the numeric
`upstreamStatus`; Location and upstream body are discarded. Other non-2xx
responses contain only `PROVIDER_UPSTREAM_REJECTED` plus that numeric status.
In particular, a provider 401/403 is returned without retrying or changing
identity. Network/transport exceptions are replaced by fixed error codes and
cannot expose URL or provider diagnostics.

For a 2xx response, an oversized declared length is rejected before consumption.
Otherwise the module reads chunks with an actual hard 2 MiB limit, retaining
at most those bounded original chunks until completeness is known. A truncated
or oversized subscription returns a sanitized failure before any successful
subscription bytes are sent. The validated original chunks are then returned
as a byte stream, without string/JSON decode-reencode, with
`application/octet-stream`, private/no-store/no-transform and nosniff headers.
There is no unbounded `arrayBuffer()` read, file write, R2 save or secret-content
logging. This bounded completion check also avoids exposing partial content to
the downstream configuration importer.

The approved administrator still uses the existing strict node importer and
native Mihomo `-t` validation before saving a private configuration and sending
it to a server. An upstream 2xx body alone does not establish valid nodes,
working proxy service, subscription updates or successful registry transport.
This module does not start services, modify host networking or change a Docker
configuration.

Nine isolated workerd tests use an injected fetcher to cover exact origin and
normalization, absence of identity/header forwarding, rejected URL forms and
extra fields, input/output size limits, 3xx/401/403/503 behavior, transport
sanitization, byte preservation and the fixed POST action. No real provider URL,
subscription, credential or production request was used during implementation.
The API role integration and actual fetch are performed by the primary operator.
