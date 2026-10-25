# Issue #443: image input boundaries

Observed 2026-10-25, Linux amd64, Docker 28.4.0 / Buildx 0.31.0,
Node 24.19.0, Python 3.12.14. Source baseline:
`9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`; implementation commits
`8629dc90` and `0791ce18`. The parent integrates this work with #440; this
record does not claim checks against that later combined commit.

Only the server Dockerfile-specific ignore and Notebook `.dockerignore`
change. No source files, Dockerfiles, dependencies, CI coverage, current
migrations, or data change. Rollback: revert those two ignore changes and
rebuild. No production operation or issue closure was performed.

## Consumer evidence

- `package.json` runs `server/run-integration-tests.mjs`; that runner imports
  the historical runner and `integration-suite.mjs`. The historical runner
  reads the two exact historical fixture locations. `scripts/ci-scope.mjs`,
  `scripts/test-selectors.test.mjs`, and `.github/workflows/ci.yml` consume
  these repository inputs. They remain tracked and usable; existing
  `server/src/__integration__` is already excluded from the image.
- Notebook's unpackaged full-product `api/main.py` imports
  `database.async_migrate`; `database/migrate.py` also imports that manager.
  The packaged `api/rag_main.py`, `rag_commands.py`, `open_notebook/rag/**`
  and their domain helpers use `database.repository`. The adapter imports
  `utils.proxy`, not either old migration manager. `database` has no
  `__init__.py` at this baseline: it is an importable namespace package.
- `rag/runtime.py` and `rag/shadow.py` read their adjacent
  `rag/schema.surrealql`; `rag/generation.py` imports shadow, and the image
  entrypoint invokes generation. All remain byte-identical in the COPY
  probe. So do the repository adapter, RAG API and worker inputs.
- `server/src/db/runtime-profile.ts` reads root/server package manifests
  and locks; `migrate.ts` statically imports
  `development-runtime-qualification.ts`. Web, Worker, `migrate-bin.ts`, all
  current product migrations and `server/scripts/knowledge-rag-smoke.ts`
  remain present and byte-identical. There is no name-based removal of
  development, scripts, smoke, or current migrations.

## Actual Docker COPY and OCI archive observations

Run from the repository root (no registry credentials or base image pull):

```sh
python docs/evidence/issues-440-443-444/issue-443-probe.py /tmp/issue443-repro
```

The script uses the fixed baseline ignore rules versus current ignore rules
against the same checkout, builds `FROM scratch` probes, and reads actual
Docker `save` OCI archives. Server scope is `COPY server` plus final-stage
root package identity from the server dependency stage. Notebook scope is
exactly the baseline final-stage source COPY list, excluding `--from`
dependency layers. Baseline and current Dockerfiles/ignore sidecars, build
logs, archives and complete inventories are written to the output directory.
It asserts the exact removal lists and checks retained files.

| Probe | Files before → after | Source file bytes removed | OCI uncompressed layer bytes before → after |
| --- | ---: | ---: | ---: |
| Server | 542 → 536 | 60,388 (6 files) | 3,835,904 → 3,767,296 |
| Notebook | 81 → 29 | 96,381 (52 files) | 392,704 → 252,928 |

Both probes have **zero added files and zero changed retained files**.
The [machine-readable report](issue-443-inventory.json) records each removed
path/hash, retained inventory hashes, OCI manifest/config/layer descriptors,
and exact byte counts. The server removes only the issue's three fixture
files and three runners; Notebook removes only two old migration Python
files and SQL `1..25` plus each `_down` file. Total removed source payload is
156,769 bytes. OCI probe layer differences are 68,608 and 139,776 bytes;
these include tar metadata/padding. The descriptors use
`application/vnd.oci.image.layer.v1.tar`, **not compressed transfer layers**.
No full production image build, registry-transfer saving, or production
readiness result is claimed here.

The initial candidate `8629dc90` used `!open_notebook/database/` and an
exception for `repository.py`. Actual Docker COPY retained all 52 unwanted
files because reincluding that directory includes its children. Reproducing
that candidate with the same final source COPY probe yielded the exact
baseline 81-file inventory and OCI manifest
`sha256:dd35e42952be96e5cbc528b3fc884f065cb4944cecc4b7370e0f211bede13686`:
[initial result](issue-443-initial-allowlist.json). Fix `0791ce18` explicitly
excludes `open_notebook/database/**` before the adapter exception. To replay
the initial failure, use the generated `notebook-before.Dockerfile` with
`git show 8629dc90:third_party/open-notebook/.dockerignore` as its
Dockerfile-specific `.dockerignore` sidecar; build against
`third_party/open-notebook`.

## Focused checks and limits

- `node --test scripts/production-rag-contract.test.mjs scripts/test-selectors.test.mjs`:
  **33 passed**. Includes historical fixtures, exact migration test routing,
  malformed scope rejection, unsafe database refusal and CI consumers.
- `DATABASE_URL=postgres://fixture@127.0.0.1:18438/runtime342_dev_aaaaaaaaaaaa_bbbbbbbbbbbb_test node --import tsx --test server/src/__tests__/{run-trace-runtime-profile,public-purpose-runtime-profile,conversation-repair-runtime-profile,development-runtime-qualification}.test.ts`:
  **8 passed**. Qualification guards reject fabricated tokens and foreign
  pools before connecting. First attempt without `DATABASE_URL` correctly
  stopped in the existing environment guard (3 passed, 1 failed); supplying
  the synthetic loopback fixture URL allowed the owning tests to execute.
- In `third_party/open-notebook`, install with
  `UV_CACHE_DIR=/tmp/issue443-uv-cache uv sync --frozen --python 3.12 --no-default-groups --group dev`,
  then `.venv/bin/python -m pytest -q tests/test_rag_contract.py tests/test_r2_artifact_storage.py`:
  **36 passed**, one upstream Pydantic deprecation warning. The first sync
  failed because the default `/home/agent/.cache/uv` is read-only; relocating
  only the cache resolved it.
- Extracted the actual after-probe Notebook `/app` files to an isolated
  temporary directory and copied the existing test/conftest there. Five
  existing checks passed against that packaged copy: exact route table,
  embedding bootstrap, changed-contract refusal, readiness recheck, and
  transient initialization retry. Imports of `repository`, `runtime`,
  `generation` and `shadow` resolve inside the packaged copy; adjacent RAG
  schema exists; neither old migration module nor SQL directory exists.
- Extracted server manifests/locks pass
  `assertLockedRuntimePackage(files, '3.8.12')` with exact matching
  integrity/tarball identity. Shared preinstalled root/server dependencies
  are **3.5.2**, so `loadLockedRuntimePackage()` correctly rejects them.
  The 8 passing tests above therefore do not establish successful startup
  with the current formal installed package. Current Web/Worker/migration
  startup and full image checks belong to the parent/#441/#442 verification;
  they were not repeated with stale local dependencies.

Docker initially needed `DOCKER_CONFIG` under `/tmp` because the default
Buildx configuration directory is read-only. An initial draft probe tried
copying absent `bin/` and failed before building; the final probe uses only
actual relevant COPY inputs. No sandbox escalation, guard disabling,
production access, external write, or independent review was performed.
