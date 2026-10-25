# Issue #495 independent Cloudflare resource provisioning

The operator entry is `scripts/release/provision-cloudflare/index.mjs`, run
through the existing trusted production launcher:

```
source /workspace/.lingxi-production/env.sh
lingxi-prod run node --use-env-proxy scripts/release/provision-cloudflare/index.mjs
```

The default performs read preflight and prints the bounded plan. `--preflight`
prints only availability; `--execute` is the explicit mutation switch. Execution
requires the task's existing resource-specific authorization. It does not grant
future permission to create or change arbitrary Cloudflare resources.

The approved plan is limited to two remotely managed named Tunnels
`lingxiloop-release-a` and `lingxiloop-release-b`, Access applications for
`release-a.lingxilearn.cn` and `release-b.lingxilearn.cn`, one Access service
token `lingxiloop-release-controller` valid for 2160 hours (90 days), the two
corresponding proxied CNAME records, and a private `lingxiloop-releases` R2
bucket. Each tunnel has one exact hostname mapping to
`http://127.0.0.1:17951` followed by `http_status:404`. Its Access application
has exactly one `non_identity` policy including only that token's `token_id`;
all other access is denied by default.

The script uses the existing Sigillo-injected Cloudflare token. Resource
inventory is paginated and checked by exact name/domain before creation. An
existing conflicting application, policy, DNS record or tunnel configuration
is rejected; it is never silently overwritten. Only a new tunnel/app recorded
as created by this operation can have its initially empty configuration
completed. An uncertain create response triggers a name/id lookup before any
possible further action. Known denied write actions are not retried by an
ordinary rerun. Changed permissions require new operator evidence and an
explicitly authorized continuation of the blocked action. After that evidence,
`--resume-denied` starts one new credential revision without erasing any earlier
outcomes. The same credential revision cannot reopen another denial.

The Access token's one-time `client_secret` and `client_id` are immediately sent
to the official Sigillo CLI through stdin with no value in argv. The project is
dynamically resolved as the unique `LingxiLoop Control Plane`, and `prod` must
exist. Only secret names, project ID, token ID and save status enter metadata.
No secret value, connector token, request body or raw API response enters
stdout, a local file or Git. The connector-token GET endpoint is never called.
A lost service-token creation response is reconciled by name, but a missing
one-time secret blocks continuation; the script does not recreate/rotate it.

Backend DNS, Worker deployment, CI secrets, host connector installation,
existing routes and the business entrance are outside this script's ownership.
No unrelated hostname, existing resource deletion, business restart or
production pointer switch occurs here.

## Actual execution receipt — 2026-10-25

Non-secret per-step metadata is retained outside Git at
`/workspace/scratch/handoff-495/cf-495.json`.

- Read preflight succeeded for token verification, Tunnel inventory, Access
  application/service-token inventory, the active `lingxilearn.cn` zone and R2
  bucket inventory. These read results did not establish write permission.
- `lingxiloop-releases` was actually created. Subsequent managed-domain and
  custom-domain reads verified `enabled: false` and no custom domains.
- Reading DNS records for `release-a.lingxilearn.cn` returned HTTP 403. DNS
  actions stopped; no CNAME was created and the denied DNS action was not
  retried.
- Creating `lingxiloop-release-controller` through the Access service-token API
  returned HTTP 403, Cloudflare code 1010. No token/secret was created or saved.
  Dynamic Sigillo project/prod resolution had succeeded before the request.
- Creating `lingxiloop-release-a` through the Tunnel API returned HTTP 403,
  Cloudflare code 10000. This denied action stopped; creation of tunnel B was
  not attempted against the same unavailable write capability.
- Access applications/policies were not created because their exact scoped
  service token is unavailable. No tunnel configuration, connector token,
  DNS record, existing route or business entrance was changed.

Remaining blockers are genuine provider permissions for zone DNS read/write,
Cloudflare Tunnel creation/configuration and Access service-token creation.
Access application/policy write permission remains unverified. The already
created private bucket is retained. Nothing here establishes a functioning
host connector, authenticated executor endpoint or an accepted production
release.

## Authorized continuation — 2026-10-25 12:29 UTC

After the user updated the Sigillo credential and explicitly reconfirmed the
scoped operations, the previously denied operations succeeded. Both exact
named Tunnels, Access applications with one service-token-only policy, and
proxied release-a/b DNS records were created and read back. The private bucket
remains private. The one-time Access credential and the two connector tokens
were saved to Sigillo through stdin. A/B received only their own connector
token and the Access credential through the encrypted bootstrap handoff.

`backend.lingxilearn.cn` was separately added as a proxied A record for the
existing B host after reading the actual original loop A record. The original
loop record is DNS-only and was preserved. Backend origin routing, connector
health, executor start, controller API ingress and production acceptance must
still be verified; resource creation alone is not a working release path.

Local tests cover exact ingress/default deny policy, rejection of additional
policies, complete inventory pagination and one-shot reporting of a real HTTP
403 without retry or credential diagnostics.

API formats follow the official [Cloudflare Tunnel create
contract](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/methods/create/),
[Access service-token create
contract](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/service_tokens/methods/create/),
and [Access policy
contract](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/subresources/policies/methods/create/).
