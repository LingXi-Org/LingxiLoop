# Case evidence through the live knowledge service

Recorded on 2026-10-19 at application commit
`f5c9a3034d21c42945fa21c39b0fe8de0cfacdb4`, based on PR189
`030205ed13681efd96b0e51125ba1626f0212cbb`. This is synthetic, non-production
qualification using the published **LingxiOS 3.5.2** package. It is **not** final
3.5.3 release acceptance or deployment evidence.

## What ran

`cases-live.test.ts` exercises the real product ingestion worker, fixed Notebook
HTTP API, SurrealDB source/index/search, real `knowledge.search` and
`knowledge.read_source` parse/authorize/execute, and real context
load/authorizeRequest. It checks publication identity, unpublished draft isolation,
republish rejection of old evidence, every human audience member's access, and
unpublish rejection while the upstream source still exists. See `result.json` for
the sanitized result and image identities. One live scenario passed, zero skipped.

Notebook is the image named in the repository's knowledge deployment manifest,
`c132e9f20b3df1873792618ed3f3bfe8be2be00e`, pinned here to its observed digest
`sha256:3079e66373006c38539a14646e4d3b2ec0d4feeade92346ed855293b8c53f4ca`.
SurrealDB is pinned to its observed v2 digest. The isolated internal Docker network
has no route to paid providers. `embeddings.py` returns synthetic, constant
1024-dimensional vectors: this verifies contracts and isolation, not semantic
ranking. Wukong and product staging storage use existing in-memory integration
fixtures; Notebook's own storage/readiness uses real local MinIO. There is no
model-generation call, embedding ledger qualification, or production credential.
All passwords and identities in these fixtures are deliberately synthetic.

## Reproduce locally

Requires Linux Docker with host access to container bridge addresses, installed
repository Node dependencies, and the real **0044 from PR190** integrated before
0045. The qualification used 0044 from
`e6a2fe53c350a5551ec32c7644c40a5e10e832ba`; that SQL is deliberately absent from
this evidence commit. Do not insert a placeholder. The initial fresh local run
migrated 1 through 45; repeated migrations were no-ops.

The runner deliberately uses only the repository's local test PostgreSQL port,
a dedicated disposable database, and Redis database 15. It clears inherited app
configuration, disables external model calls, and never reads a production dotenv.
The test resets its database tables, so reserve this database for this scenario.
Do not run another integration process against it simultaneously.

From the repository root:

```sh
docker compose -f e2e/server/compose.yaml up -d --wait postgres redis
# Once, if this dedicated disposable database does not exist:
docker compose -f e2e/server/compose.yaml exec -T postgres \
  createdb -U postgres lingxiloop_cases_review_test

cd docs/evidence/issue-187/live-case-agent
# Qualification reused this pre-existing local MinIO image. If unavailable,
# provide an available local test MinIO image via CASE_TEST_MINIO_IMAGE.
docker image inspect "${CASE_TEST_MINIO_IMAGE:-lingxiloop-cloud-minio:20250907}" >/dev/null
docker compose up -d --wait surrealdb storage
node initialize-bucket.mjs
docker compose up -d --wait embeddings open-notebook
node run.mjs live
```

The fixture uses a dedicated Docker project and named volumes. Internal-network
port publishing is unavailable in the qualification environment, so scripts
resolve local bridge addresses by inspecting only these named test containers.
If those addresses are unreachable on the host, the prerequisite is unmet; do not
substitute a production endpoint. The image repository must be pullable or its
fixed image already cached. No new credentials are supplied by this evidence.

Optional owning regression, from the same directory:

```sh
node run.mjs owning organization-cases.test.ts knowledge-vertical-slice.test.ts \
  attachment-answers.test.ts migration.test.ts
```

Recorded owning regression: **48 passed, 0 skipped**; server tests: **106 passed,
0 skipped**; server typecheck and repository `server:lint` passed. The initial red
run recorded the three intended Agent-boundary failures. An intermediate expanded
run exposed an incomplete synthetic conversation fixture; the corrected final run
passed all 48. The packaging change only makes paths repository-relative and pins
observed image identities; unchanged behavior tests were not rerun for packaging.

Local runs write `cases-live.log` or `cases-owning.log`, ignored by Git. The checked-in
`result.json` contains only sanitized assertions and counts. The live scenario
removes its own upstream sources. To stop only this fixture stack while retaining
its local data, run `docker compose stop` from this directory. Removing its volumes
with `docker compose down -v` is optional cleanup after review; the shared local
PostgreSQL/Redis test services are outside that command's project.
