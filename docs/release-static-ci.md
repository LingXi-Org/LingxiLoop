# Static frontend and controller CI (issue #495)

The handoff flag is repository variable `RELEASE_CONTROLLER_ENABLED=true`.
Until that flag is enabled, `update-manifests`, admin deployment and Komodo
rollout keep their existing behavior, and the default Docker target retains the
SPA. After handoff those three jobs are gated off; GitHub builds/publishes
artifacts and registers a candidate, without writing deployment state to main or
a production branch. Only the release controller changes deployed versions.

## Owning builds and source identity

`GET /v1/accepted` must return a verified source for all seven target IDs:
`main-runtime-a`, `main-runtime-b`, `main-frontend`, `notebook`, `wukongim`,
`admin-worker`, `gateway`. Each needs its full accepted target descriptor plus
`releaseId`, exact `appSha`, and `sequence`. CI refuses an empty bootstrap; it
never invents production source identities.

Every component is compared from its own accepted SHA to the target SHA. The
classifier reuses the existing workflow path filters and traces relative imports
from server sources into shared browser helpers. Pure CSS/layout changes build
the frontend only. A shared helper imported by the server also builds and checks
the runtime. The controller path selects Docker target `runtime`, which builds
only its dynamic visualize renderer and excludes the SPA. The legacy default
remains available only for the transition.

The runtime candidate verifies both exact LingxiOS locks/provenance and the full
ordered product migration inventory, including names and every checksum,
against its accepted source. By default any changed runtime/schema inventory
fails with `CONTRACT_CHANGE_REQUIRES_ATTESTATION`. D1 migration changes still
fail with `ADMIN_MIGRATION_REQUIRES_ATTESTATION`.

There is exactly one expansion input: an immutable same-repository GitHub
artifact named `release-contracts-<full app SHA>` containing
`release-contracts.json`. A manual main workflow names its producer through
`release_contract_run_id`; CI verifies that run succeeded at the exact app SHA,
then downloads that artifact and installs only the locked `server-ci` graph to
read the formal package's public `releaseVersions` and `packageResources()`.
The actual package runtime/native schema/control-plane version and SHA-256 of
its published schema bytes must match the explicit contract input. A stale
local installed package does not qualify. No reviewed production contract file
is manufactured by this feature.

The JSON input has this structure (field descriptions, not deployable values):

- `version: 1`, exact `appSha`, and fixed `opsSha`.
- `targets.main-runtime-a` and `targets.main-runtime-b`, each with identical
  target `contract` and `hostPlan.database`.
- Each target's `publicPackage` is `{lingxios, nativeSchema, controlPlane,
  schemaHash}` matching the independently loaded public package exports.
- `contract` retains concrete API/Worker/checkpoint/control strings, required
  capabilities, exact `lingxios`, and the full ordered `{version, checksum}`
  product inventory derived from the target commit.
- `hostPlan.mode` is `maintenance`; `hostPlan.database` specifies exact accepted
  `from` and target `to` schema pairs, `strategy: maintenance`,
  `rpo: zero-committed-writes`, and the full ordered `{version, name, checksum}`
  inventory. Every accepted migration is preserved byte-for-byte.
- `profileKeys: {source, target, recovery}` contains concrete trusted-host policy
  references of the form `<native>:<product>:<published-schema-sha256>`. The target
  and recovery keys must match the actual target package schema bytes. For a
  same-package source the source schema hash must also match. For a native
  package transition, the accepted source key is a reference checked against
  actual source database evidence by the trusted host policy; its presence in
  this artifact does not authorize or install a new profile.
- `hostPlan.recovery` separately specifies exact recovery `appSha`, immutable
  image `artifact`, all service `images`, target-schema-compatible `contract`,
  and the unchanged effective `configurationHash`. Its source commit must have
  the same formal package identity and full target migration inventory, and its
  contract must retain all target protocols and capabilities. The runtime does
  not fall back to an old-schema accepted image after migration.

CI always derives `hostPlan.source` from the actual accepted images/contract/
configuration. It emits database side effects only for runtime A, while both
nodes declare the target contract and explicit compatible recovery. Same-schema
follow-up releases strip an old accepted database plan, so a previous migration
cannot accidentally trigger fresh backups or migration. Trusted profile
installation, real backup/restore qualification and runtime business probes
remain host/controller responsibilities; the JSON input supplies no approval
boolean and no arbitrary commands.

Image receipts retain separate registry index, linux/amd64 manifest, image
config and uncompressed layer digests. Host plans replace service image
identities, preserve effective configuration/volumes, and prepare accepted image
identities as recovery. Runtime plans use maintenance mode until real mixed
version/checkpoint compatibility is established. Frontend targets depend on
both runtime targets and the admin Worker when those are in the candidate.

Before registering, CI requires the candidate still be main's current head;
late older builds cannot win through a later workflow run number. It refreshes
accepted component sources after building and refuses changed configuration.
Checks and artifact names bind the exact SHA and workflow attempt. Submission
uses `POST /v1/releases` and `Authorization: Bearer $RELEASE_API_TOKEN`.

## Static ingress and retained chunks

`workers/web-static/wrangler.jsonc` uses Static Assets with worker-first routing
and no automatic SPA fallback. The Worker explicitly handles HTML navigation.
API/auth/file APIs go through the `AUTH` service binding to
`lingxiloop-control-plane`, retaining the public request URL for Better Auth's
base URL and cookies. That Worker remains responsible for session checks,
tenant authorization and gateway HMAC signing.

The explicit independent `AUTH_ORIGIN_BASE_URL` is a fallback for environments
without that binding. `BACKEND_ORIGIN_BASE_URL` is the separate backend ingress
for ticket-authenticated WS, dynamic runtime/visualize, legacy protected file
paths and webhooks. `/internal` is rejected. Neither upstream may be the public
SPA host; a hop marker rejects recursion. API fallback never returns HTML.
Streaming bodies, WS upgrade responses, cookies, authorization, Range/ETag,
Last-Event-ID and webhook signatures pass through without buffering/retrying
side-effect requests. The backend retains its existing authentication boundaries.

The auth Worker's backend `ORIGIN_BASE_URL` must be switched to the independent
backend before the SPA domain is attached. The old loop → admin → loop path
cannot remain active after handoff. Initial custom-domain/route ownership is an
explicit controller bootstrap operation; the static config intentionally does
not claim the live domain during a version upload.

CI uses `wrangler versions upload`, records the returned Worker UUID and never
runs `versions deploy` on the controller path. Its immutable artifact hash is
SHA-256 over the sorted `{path, hash, bytes}` inventory of assets, Worker
sources/configuration, the locked Worker dependency graph and effective public
origin variables. Configuration gets a separate `cfg-<hash>` identity. Sources
and relevant MIT notices accompany the assets.

Before version registration, all `/assets/*-<hash>.<extension>` chunks are copied
to R2 `chunks/assets/...`. Missing current-version chunks are read there; a
missing JS/CSS URL stays 404. Existing different content at an immutable key is
rejected. Worker receipt and inventory are retained at
`releases/gh-<runId>-a<attempt>-<sha12>/<target>/{artifact,inventory}.json`.
The current version UUID and recovery version UUID remain in the accepted
ledger/manifest. This path never prunes chunks: retirement requires a separate
controller GC after both old-page and recovery windows expire, so an ordinary
release cannot delete chunks still needed by old tabs.

## Configuration and remaining handoff requirements

Existing secrets: `RELEASE_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, and the existing
package registry token. Required repository variables: `RELEASE_API_URL`,
`RELEASE_OPS_SHA` (exact fixed executor/tool SHA), `CLOUDFLARE_ACCOUNT_ID`,
`RELEASE_BACKEND_ORIGIN` (mapped to the Worker backend variable),
`AUTH_ORIGIN_BASE_URL`. `RELEASE_ARTIFACT_BUCKET`
defaults to `lingxiloop-releases`; the Worker R2 binding must name that
same bucket. Optional Vite public variables remain public build configuration.

Before enabling the flag, the integrator must verify production inventory,
import all accepted contracts/configuration/host plans/probe IDs, install the
controller and trusted host policies, verify the independent backend and auth
service binding, create R2/bindings and Worker initial versions, transfer domain
ownership, and ensure old and new executors cannot both write a target. These
are real production prerequisites, not checks that the local unit suite can
prove. Runtime migration releases require the exact contract artifact and installed trusted
profiles described above. Admin D1 migration releases remain blocked until a real
attested D1 migration/recovery adapter exists. GC/retirement is deliberately
separate from the serving guarantee and has not been enabled here.

Local checks: `node --test scripts/ci-scope.test.mjs
scripts/release-candidate.test.mjs workers/web-static/src/index.test.mjs`, plus
the existing `production-rag-contract.test.mjs` owning regressions. No production
deployment, credentials change, throughput benchmark or live readiness claim is
made by this implementation.
