# Reversible retirement of the legacy Komodo publisher (#495)

Status: **prepared, no production writes performed**. The designated integrator
applies this only after the new release is accepted. This is publisher ownership
retirement, not container retirement: no Stop/Destroy/Delete/Deploy/RunSync API
calls, no container or volume removal, and no credential revocation are required.

## Observed objects and the exact patch

The authenticated Sigillo-only read at `2026-10-25T18:57:17.443Z` returned Core
`2.3.3`. Evidence is `/workspace/scratch/handoff-495/legacy-retirement-read.json`;
it contains selected flags, IDs, source/config hashes and action states, without
environment values, webhook secrets, API keys or full resource configurations.
All eight stacks, all four Procedures and the ResourceSync were idle at that
observation. Recheck immediately before applying: this is not a lasting lock.

| Object | Exact ID | Partial `config` patch |
| --- | --- | --- |
| `lingxiloop-core-state` | `6aa8a3e8b35d27bdd4e12ae0` | `webhook_enabled: false, poll_for_updates: false, auto_update: false, auto_update_all_services: false` |
| `lingxiloop-app-a` | `6aa8a411b35d27bdd4e12aef` | Same four fields |
| `lingxiloop-app-b` | `6aa8a414b35d27bdd4e12af1` | Same four fields |
| `lingxiloop-knowledge-agent` | `6aa8a3ebb35d27bdd4e12ae2` | Same four fields |
| `lingxiloop-production-rollout` | `6aa8a416b35d27bdd4e12af5` | `schedule_enabled: false, webhook_enabled: false` |
| `lingxiloop-production` ResourceSync | `6aa8a273b35d27bdd4e12a8d` | Shared source patch below |

For each of the four stacks the observed old values are
`webhook_enabled=true`, and all three polling/update flags are already `false`.
For the old Procedure both flags are `true`, but `schedule` is empty. Preserve
the schedule string, stages, webhook secrets, metadata, permissions, repo/source,
environment and current container state. Do not remove the Procedure or stacks.
Use `/write/UpdateStack` and `/write/UpdateProcedure` with `{id,config}` containing
only these fields. Komodo 2.3.3 merges partial config fields rather than replacing
the whole configuration. See its [Stack](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/entities/stack.rs),
[Procedure](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/entities/procedure.rs),
and [partial update API](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/api/write/sync.rs).

The ResourceSync currently has `webhook_enabled=true`, `managed=false`,
`delete=false`, `include_resources=true`, `include_variables=false`,
`include_user_groups=false`, empty `repo`/`linked_repo`, `files_on_host=false`, and
`resource_path=["deploy/komodo/resources.toml"]`. Its inline source still declares
all eight stacks and the old Procedure. Its existing preview has **four resource
updates and three deploys pending**. Do not execute it.

Use `/write/UpdateResourceSync` with exact ID above and this partial config:

```json
{
  "webhook_enabled": false,
  "managed": false,
  "delete": false,
  "repo": "",
  "linked_repo": "",
  "files_on_host": false,
  "resource_path": ["deploy/komodo/shared-resources.toml"],
  "file_contents": "<exact reviewed shared-resources.toml bytes>"
}
```

The reviewed replacement source SHA-256 is
`cca6816135ad1781c342493f3dbde3148728aff1ea20519a1e2a9799ee14ba69`.
It declares only the four retained stacks below. Their service configuration is
unchanged except for the explicit immutable ingress source pin below; ordering
dependencies on the controller-owned stacks are replaced by `server-b-ingress`. The historical full
`resources.toml` remains intact for evidence and explicit ownership rollback.

Both `managed=false` and `delete=false` are mandatory. In the official
[2.3.3 execution code](https://github.com/moghtech/komodo/blob/v2.3.3/bin/core/src/api/execute/sync.rs),
effective deletion is `managed || delete`; merely removing resource declarations
is unsafe when either is enabled. Do not enable managed mode or call any delete
API. The [ResourceSync schema](https://github.com/moghtech/komodo/blob/v2.3.3/client/core/rs/src/entities/sync.rs)
has a webhook flag; it does not define a separate sync cron schedule.

## Retained scope

| Retained object | Exact ID |
| --- | --- |
| `server-b-ingress` stack | `6aa8a3a0b35d27bdd4e12acd` |
| `landing` stack | `6aa8a3e6b35d27bdd4e12ade` |
| `lingxilit` stack | `6aa8a3edb35d27bdd4e12ae4` |
| `uptime` stack | `6aa8a415b35d27bdd4e12af3` |
| `Backup Core Database` Procedure | `6aa89b90775d6e01dfed18e2` |
| `Global Auto Update` Procedure | `6aa89b90775d6e01dfed18e4` |
| `Rotate Server Keys` Procedure | `6aa89b90775d6e01dfed18e6` |

Keep all of these and the shared Core/servers untouched. The three shared
Procedures have daily schedules at 01:00, 03:00 and 06:00 respectively. Do not
disable the global updater to retire four stacks whose update flags are already
false. Preserve existing shared stack webhooks and private access permissions.

### Retained backend route and ingress source pin

The approved host route addition must persist when retained ingress resources
are later refreshed. The repository `server-b-ingress/dynamic.yml` now exactly
matches the fixed `backend-route.py` actor output and the accepted production
apply receipt: SHA-256
`0157eb67307692d96afd0b5474d54b5879896abbad7fbb37c7c6f6ea011ea609`.
The pre-addition source was
`6634cc3a59c3824a7f6f7561c02387200775a1830c62bcb9fe7178537df045ac`.
Only a cloned `backend` router was added; the original loop router and every
service/upstream byte remain unchanged. Both Host rules use `websecure`,
`service: gateway` and `tls.certResolver: letsencrypt`, with the same
`http://gateway:8080` backend. Traefik does not validate the product HMAC;
forwarding still reaches the same gateway/Web authorization path without a new
middleware, header rewrite, alternate origin or authentication exception.

The live read-only sanitized evidence is
`/workspace/scratch/handoff-495/backend-retirement-route-read.json`. It confirms
the exact target hash, both routers, no declared router middleware and the
original gateway server URL. No full production configuration was emitted.

The shared source fixes ingress `commit` to
`816433430c71887905bf277d6ced523cc92f6674`, whose actual Git object contains this
exact route file. This is an additional intentional partial config change for
`server-b-ingress` (`6aa8a3a0b35d27bdd4e12acd`): observed `commit=""` becomes that
SHA; its repo, branch, credentials, webhook, service config and volumes stay as
recorded. After review, the integrator may set only this field through
`UpdateStack` and read it back; no PullStack/RunSync/Deploy is needed or authorized
by this preparation.

The published 816 object remains the qualified ingress source independently of
the runtime operations version. The fixed retirement operator now requires
runtime/controller operations and trusted `RELEASE_OPS_SHA` readback to match
reviewed protocol-2 head `4de017e61253f39931c4b861d121f1508369de53`; required controller enablement is
`RELEASE_CONTROLLER_ENABLED=true`. These are execution prerequisites, not claims
that the operator may execute before every required receipt is supplied. The
fixed already-admitted d378/gen6 source may use its exact read-only final
verification receipt with the new 4de automatic recovery proof. Its manifest,
original ten host receipts and R2 verified-body hashes are pinned in the actor;
the complete recovery checkpoint retains the semantic stages, request budgets,
single known-failure transition and original volumes. No repeated host
publication is required merely to make both manifest Ops fields equal.
Do not change the existing ingress pin/source hashes merely because runtime Ops
changes, or float back to `main` as a fallback. See the exact
[operator inputs](../scripts/release/LEGACY-RETIREMENT-OPERATOR.md).

## Serialized execution and verification

1. Require the accepted release, its business/readiness evidence and the new
   controller's recorded ownership. The user must set GitHub repository variable
   `RELEASE_CONTROLLER_ENABLED=true` through an authorized Variables action. The
   cloud credential's observed Variables 403 is a blocker, not permission to
   bypass or silently leave both publishers active. The old and new CI jobs are
   already mutually gated by this variable.
2. Merge the reviewed repository guard only as part of this accepted handoff.
   Verify no old Actions publisher run is queued or active, no legacy Procedure
   or sync is active, and no controller mutation is unresolved. The integrator
   owns this exclusive window. Re-read exact IDs and changed fields; stop on
   drift or an unknown action result.
3. First atomically detach the ResourceSync source and turn off its webhook with
   the config patch above. This prevents another sync from restoring the old
   flags. Read it back before proceeding. Next disable old Procedure triggers,
   then disable the four stack webhooks and reaffirm their update flags. Each
   write has an immediate readback; a missing reply is observed before retrying.
4. Call only `/write/RefreshResourceSyncPending` with
   `{sync:"6aa8a273b35d27bdd4e12a8d"}` to recompute the preview. Require no errors,
   no protected stack/Procedure IDs, no Create/Delete, and only retained Stack
   IDs among resource/deploy entries. A nonempty retained preview is information
   for its own owner, not authorization to RunSync. Never execute the old preview.
5. Re-read flags/source hashes and retained object config hashes. The ingress
   source pin is the sole retained Stack config difference; other retained
   configs, shared Procedures, business container IDs/images/health and every
   original volume must be unchanged. Record each successful partial-config
   readback separately; do not report an accepted request as a completed handoff.

`scripts/sync-komodo-config.mjs` is narrowed to the reviewed shared source. It
rejects an old source before any network call, rejects managed/delete before any
write, and validates preview targets without executing them. The historical
publisher entrypoint now refuses before reading credentials or calling schema,
DB preparation, sync or webhook helpers. This also prevents a stale/manual
invocation of the current repository entrypoint from reacquiring ownership.
Older already-running checkouts must still be excluded by step 2.

## Exact configuration rollback

Rollback restores publisher configuration; it does not roll back application
images or schemas, run the old Procedure, or roll back data. Pause new publisher
admission and resolve its operations first. Verify that the current installed
schema/protocol/image contracts permit any subsequently intended legacy action.
Changing a feature flag is not proof of application backward compatibility.

The observed original inline source is exactly this immutable repository template:

```text
33e97c9f98606f22f2762e5cab2bc66ccd2291ff:deploy/komodo/resources.toml
SHA256 5e2fa5e7ec7fb401ae4021a8b8730ecd127a77bf5f73be0b4c49bb9d8ba987e9
```

The exact historical bytes are bundled in
`scripts/release/fixtures/legacy-resources-33e97c9f.toml`; the operator requires
the byte hash before using them, including in shallow checkouts. They can be
independently compared with `git show` when the old Git object is available. The
template matches the recorded legacy source exactly, so no full secret-bearing config
backup is needed. A publisher-ownership rollback must retain the approved
backend route and immutable ingress pin: insert only
`commit = "816433430c71887905bf277d6ced523cc92f6674"` after `branch = "main"`
inside its first `server-b-ingress` block; that reviewed rollback source has
SHA-256 `f92e316937d35ca93ae3c26cbccc7789492f37085731f789f17b9e2596b0e024`.
Use it when restoring `file_contents` and
`resource_path=["deploy/komodo/resources.toml"]`, preserving the original empty
repo/link, host mode false, and managed/delete false. Keep webhooks disabled
while verifying the restoration. Never restore the ingress commit to empty or
pull the pre-backend source as part of publisher rollback. Restore each owned
stack's webhook to true and the
three polling/update flags to their recorded false values. Restore Procedure
`schedule_enabled=true` (its recorded schedule is still empty) and webhook true,
then ResourceSync webhook true only when the old publisher is deliberately
re-established. Revert this repository retirement guard as part of that reviewed
ownership rollback. Switching the GitHub variable back to false is the final
exclusive-ownership step, requiring the same user Variables permission. Do not
run pending deploys or turn on an old schedule merely to test recovery.

## Development validation

```sh
node --test scripts/sync-komodo-config.test.mjs scripts/schema-upgrade-maintenance.test.mjs
```

The tests exercise source membership, preservation of shared service config,
old-source rejection, deletion-mode refusal, protected preview refusal and the
retired CLI's early failure. Production partial writes and readback verification
remain unexecuted by this preparation task.
