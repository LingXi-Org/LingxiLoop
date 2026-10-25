# Durable release controller (#495)

Status: implementation and isolated verification in progress. Production still
uses the retained Komodo path. Do not enable the repository variable
`RELEASE_CONTROLLER_ENABLED` until the new executors, inventory, probes and
handoff have been verified. A merged PR is not a production accepted release.

The release API, SQLite Durable Object and Workflow live in `workers/release`.
One object named by `ENVIRONMENT` owns candidate ordering, desired/accepted
component identities, the Workflow start outbox and all conflicting resources.
R2 `lingxiloop-releases` stores manifests and receipts; it is not a lock. Each
candidate pins `appSha` separately from `opsSha`. Controller upgrades must wait
for no active Workflow or preserve the manifest's protocol semantics.
Set `CONTROLLER_OPS_SHA` to the exact deployed operations commit and install
the same commit in each host policy's `acceptedOpsShas`. Candidates with a
different operations revision are rejected. Restoring a prior controller
version must preserve its protocol and the existing DO/journal data.

The API accepts only authenticated version-1 manifests. Targets have fixed
adapters, immutable artifact identities, component-specific accepted sources,
required conflict resources, exact contracts, named probes and volume bindings.
The controller never infers schema compatibility from a boolean. Runtime
schema changes currently fail with
`SCHEMA_CHANGE_REQUIRES_MAINTENANCE_ADAPTER` unless a complete database
maintenance plan and trusted host profile are supplied. The owner executes
final zero-write-loss backup, isolated restore verification, and checksum-ledger
migration after all runtime writers stop. Live database qualification remains
an open acceptance gate.

## Operation and recovery

`node scripts/release/cli.mjs plan manifest.json` validates the current accepted
source. `submit` durably registers it; `get` returns actual phase and errors;
`watch` reconnects with a durable event cursor. `resume` and `recover` require
the separate administrator credential and an observed terminal Workflow
instance. They retain the current resource generation and reuse stable host
operation keys; neither releases a blocked lock. The equivalent MCP stdio
entry is `node scripts/release/mcp.mjs` and exposes the same seven methods.
Provide credentials through the existing provider-injected environment.

The DO transaction records a pending start before the alarm calls Workflows.
If the start response is lost, the alarm queries the fixed instance ID before
marking it delivered. A duplicate release ID with different parameters is
rejected. Only queued/preparing/waiting candidates may be superseded, and only
when the newer manifest covers every older target and migration checksum.
Production mutations are never canceled because a later build completed.

Prepare all hosts first, then atomically claim all conflict resources and
recheck each accepted component. Preparation always uses generation 0 and
release-specific files. Every business mutation uses a monotonically
increasing generation. For a maintenance runtime release, drain both A/B nodes
before applying either, apply and verify both, then restore admission. Stable
ingress, homes and databases remain separate resources. Rolling execution is
allowed only when the host's local policy has an independently qualified
protocol contract.

Unknown network results are queried by operation key. Unknown side effects
keep the resource lock indefinitely until reconciliation or explicit recovery
proves the result. An expired timer or dead Workflow is not proof that a host
operation stopped. Known failures may restore only pre-prepared compatible
images/Worker versions. Forward, recovery and cleanup errors remain separate.
Failure to publish a GitHub status after production acceptance is cleanup and
does not roll back an already accepted release.

Host policy controls Compose projects, source files, service names, volumes,
barrier helpers and ingress/readiness checks. Manifests cannot supply shell
commands, local paths, arbitrary probe URLs or network credentials. Hosts must
use the same canonical manifest hash. Private configuration is not returned by
the public release status API. Detailed host receipts belong in restricted R2.

## Bootstrap and concrete access confirmation

The current zero-inflight handoff was materialized from Library file
`libfile_bb69bc945e5081918b34e3ad679cd868`, read locally, and confirmed to contain
four readable JSON records. The parent subsequently explicitly transferred
sole write coordination. It records the actual app `197e2568d46de349bb3ce0a26aefbadaae8f4723`,
LingxiOS 3.8.12, native14/product57 and the paused candidates. Its
`appIndexDigest` field is not independently sufficient registry identity:
match real index, platform manifest, image config and diff IDs before import.

The following concrete group is pending the parent's action-specific approval.
No listed secret or network resource has been created:

| Resource/action | Exact scope, impact and storage | Reversal |
| --- | --- | --- |
| `RELEASE_API_TOKEN` | Dedicated submit/read token for `lingxiloop-release`; Worker secret, Sigillo prod, GitHub production secret only | Revoke the exact token; disable candidate submission |
| `RELEASE_ADMIN_TOKEN` | Separate bootstrap/resume/recover token; Worker secret and Sigillo prod only, never Actions | Revoke exact token; production records remain |
| `EXECUTOR_TOKEN` | Dedicated authenticated fixed-action API for the two LingxiLoop host executors; Worker secret, Sigillo prod, host 0600 environment | Revoke token and stop only the new executors |
| Access service token | Allow only the two proposed release applications `release-a.lingxilearn.cn` and `release-b.lingxilearn.cn`; client ID/secret in release Worker and Sigillo prod | Revoke token and exact Access policies |
| Two named outbound Tunnel connectors | A=`182.254.156.84`, B=`111.229.65.23`; map release hostnames only to local HTTP executor `127.0.0.1:17951`, no Docker socket and no public listener; connector secrets on matching host only | Stop new connectors, remove their exact DNS/ingress mappings; keep product ingress intact |
| New executor system service | Fixed reviewed bundle/version, loopback HTTP, durable local journal, narrow local trusted policy; initial bootstrap may use existing Komodo authority as a temporary transport | Stop new service after all operations settle; preserve journal and prepared artifacts |
| Independent backend origin | Proposed `backend.lingxilearn.cn` to existing stable ingress; remove the SPA/auth proxy loop without changing user auth semantics; narrow origin access/HMAC remains mandatory | Restore the prior control Worker version and frontend pointer |
| Mihomo optional activation | Native pinned binary on A/B; loopback `127.0.0.1:17890`; secret provider; Docker daemon proxy change impacts all local pulls and may require one daemon restart | Restore saved daemon configuration and previous provider; no Docker prune or data-volume changes |

Canonical registry access can use existing verified image caches first; no
subscription is available, and the task must not guess it or request plaintext
secrets. The secure input is the environment/provider secret
`MIHOMO_SUBSCRIPTION_URL`, with its exact HTTPS origin in non-secret
`MIHOMO_SUBSCRIPTION_ORIGIN`. Proxy activation and real manifest/blob-path
verification remain pending. See `release-access.md` for the observed inventory.

No irreversible deletion is proposed. After acceptance, disable only the
LingxiLoop rollout procedure `6aa8a416b35d27bdd4e12af5` and remove LingxiLoop
deployment ownership/automatic entrypoints after verifying they no longer
write. Retain all containers/volumes until adopted, all backups/keys/history,
independent landing/LingxiLit/wegolibrary and shared monitoring/ingress. Komodo
Core must remain if those independent resources still use it. Retirement of
LingxiLoop duties and deletion of shared infrastructure are different actions.

To seed accepted state, upload the real handoff and immutable inventory to R2,
temporarily enable `BOOTSTRAP_ENABLED`, then POST `/v1/bootstrap` using the
admin credential with `zeroInFlight`, exact handoff ID, observed timestamp and
the existing evidence key. The API requires the evidence to exist. Bootstrap
is one-shot and disabled after import. An empty ledger never invents an
accepted production version.

Independent production read-only verification also completed through the
existing transport: update `6adde341e06d5e1f7984bdd3` reached `Complete`,
`success:true`, observed native14/product57, full visibility, live work=0 and
live attempts=0. The earlier update `6adde2d8e06d5e1f7984bdbd` reached
`Complete/success:false` because a one-off PostgreSQL client used a nonexistent
local socket; the verified retry selected the explicit `postgres` service.
Neither query wrote business data. Private full checksums remain with the
local handoff evidence, not in public issue logs.

## Checks and open acceptance gates

Focused checks: `tsc -p workers/release/tsconfig.json --noEmit`,
`vitest run --config workers/release/vitest.config.ts`,
`node --test scripts/release/client.test.mjs`. SQLite DO tests exercise actual
workerd storage and Workflow start outbox. The locally installed test runtime
falls back from compatibility date 2026-09-01 to 2025-12-17; this is not a
real Cloudflare deployment qualification. Host journal, static routing and CI
scope have their own owning checks.

Open gates include real host transport, actual provider bindings and probes,
trusted backup/migration strategy, each independent adapter's live inventory,
immutable artifacts, exact-commit CI, production business acceptance,
controller/executor recovery exercise and LingxiLoop old-path retirement.
Queue/build/download/drain/startup/verify/recovery timings must come from those
real receipts. No performance target is claimed from local unit tests.

An independent read-only review of commit `7cbd4a79` found four concrete races:
resumed preparation releasing an unknown old effect, lost claim responses
leaving no recovery entry, concurrent resume/recover attempts, and an outbox
commit before its first alarm. The final code pre-arms the durable alarm,
CAS-fences resume IDs and every mutation, reloads generation after errors,
permits reconciliation of any nonterminal record after the old Workflow is
observed terminal, and retains locks on resumed preparation failures. Focused
tests cover those paths. A transport regression also exercises actual workerd
fetch: redirects use `manual` and reject 3xx because the edge runtime does not
implement Node's `redirect:error` option.
