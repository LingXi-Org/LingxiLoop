# Notebook Supervisor reuse (#440)

Baseline: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d` (2026-10-25).
Implementation: `7024462a` (integrated commit). No production operation, registry push or issue closure.

## Consumer evidence and change

- Dockerfile's runtime apt Supervisor installed Debian Python 3.13 alongside the Python 3.12 image. The fresh baseline apt transaction reproduced 40 new packages / 41.7 MB total installed space; this total includes curl and is not the expected saving.
- Pin `supervisor==4.3.0` in the existing default application dependencies and uv lock. Its two entrypoints use `/app/.venv/bin/python`; the runtime apt transaction now installs only curl.
- Docker startup still executes `open_notebook.rag.generation` before Supervisor, retaining active-generation resolution and refusal of fenced/stale state. API and worker configuration, priorities, automatic restart, stdout/stderr and task concurrency remain intact.
- Dockerfile, Komodo and packaged Compose now use `/app/.venv/bin/supervisorctl` to check both processes, then `/readyz`. The packaged stack previously checked a process-name match and `/health`.
- Markdown/PDF/DOCX extraction, R2 ownership rules, schema initialization, shadow migration and recovery code are retained.

## Owning checks

- `node --test scripts/production-rag-contract.test.mjs`: **25 passed**. Includes dependency pin, startup wrapper, both healthcheck paths, restart/log settings and packaged readiness.
- Notebook dev environment: Python 3.12.14; `uv sync --frozen --no-default-groups --group dev`.
- `python -m pytest tests/test_rag_contract.py tests/test_r2_artifact_storage.py tests/test_rag_shadow_migration.py -q`: **36 passed, 17 skipped** before starting isolated SurrealDB.
- `RAG_SHADOW_TEST_URL=ws://127.0.0.1:18879/rpc python -m pytest tests/test_rag_shadow_migration.py -q`: **17 passed** in 73.05s against isolated `surrealdb/surrealdb:v2.2.1`, root credentials `test`/`test`, memory storage. This exercises generation activation/fences, recovery/replan, stale readers, source watermark checks and operator CLI.
- `git diff --check`: passed.

## Image experiment

Same `linux/amd64` platform, Python base index `sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704` (image config `sha256:a33c10a97f11005523814c6eee013986119fe41f3122f444518117536675c8e1`), uv base index `sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff`. Fresh base Python is 3.12.15.

Candidate includes #440 plus #443's `.dockerignore` migration exclusion from integration head `efba619b`; measurements therefore describe this combined Notebook change, not Supervisor alone. All other sources match the issue baseline.

The environment's Docker build container cannot resolve its proxy hostname by default. Initial dependency download failed with proxy tunnel DNS lookup errors. Retried with the host-resolved proxy address (`--add-host`) and the host CA mounted only as a BuildKit secret for uv. TLS verification stayed enabled; CA/proxy setup was not added to production files. A direct-network attempt was cancelled after waiting on inaccessible downloads. Default uv/npm/Docker caches were read-only, so temporary writable cache directories were used.

The tiktoken download then received an explicit proxy **403 Forbidden**. No retry of that URL or alternate-domain download was attempted. `issue-440-encoding.py` reconstructed the asset from the already installed JS package: 199,998 ranks, 3,613,922 bytes, SHA-256 `446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d`, exactly Python tiktoken's upstream expected hash.

Complete fixed-base builds with that asset mounted read-only hit **no space left on device** in this environment's VFS Docker storage. Therefore an unchanged production Dockerfile build is **not verified**. Successful temporary probe builds omitted only the encoding prefetch (they retained the empty cache directory); the exact asset was then copied to `/app/tiktoken-cache/fb374d419588a4632f3f557e76b4b70aebbca790` in stopped containers and committed as `issue440-before` / `issue440-after`. These filesystem-equivalent assembled images have a supplemental cache layer and distinct build history. No production Dockerfile was edited to bypass the original prefetch. Runtime and size measurements below refer to these assembled images.

| Observed measure | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Installed Debian packages | 127 | 109 | 18 |
| Exported regular file bytes | 321,094,494 | 284,951,997 | 36,142,497 |
| Docker image size bytes | 325,229,411 | 289,086,914 | 36,142,497 |
| Local OCI gzip6 layer bytes | 118,963,289 | 106,763,000 | 12,200,289 |

The baseline has four Debian Python 3.13 packages; candidate has none. Both venv interpreters are Python 3.12.15. Package manifests and OCI layer descriptors/digests are attached. All data are one local paired observation, not a registry/release benchmark.

Reproduction: first run `issue-440-encoding.py <already-installed-js-tiktoken-ranks-file>`, then `issue-440-build.py <integrated-worktree> 9e3bfd8 --assemble` reproduces the low-space assembly used here (omit `--assemble` to attempt the full prefetch build); `issue-440-runtime.py` probes the candidate with isolated synthetic dependencies; `issue-440-measure.py` exports actual images to local OCI layouts using gzip level 6 and records layer bytes, installed packages and exported regular-file bytes. Registry compression may differ. No percentage or historical apt total is substituted for measured savings.

## Rollback

Revert the six implementation files together, restoring the apt package and `/usr/bin/supervisord` startup command plus matching healthchecks. No application schema, durable corpus, migration algorithm or wire protocol changes are involved.

## Assembled image runtime result

`python issue-440-runtime.py`: **passed** with synthetic Docker-bridge SurrealDB 2.2.1, local MinIO and deterministic 1024-dimension embedding fixture. External model quality and production R2 credentials were not tested. The local R2 Docker alias was explicitly included in `NO_PROXY` so bridge-local traffic did not incorrectly travel through the environment proxy; external proxy settings were preserved. A fixture initially omitted S3 ContentType and correctly received 409; the corrected fixture exercised each retained file format.

- `/readyz` returned ready, schema version 1, 1024 dimensions, R2 probe true; the image healthcheck became healthy.
- Supervisor 4.3.0 ran as PID 1 using `/app/.venv/bin/python /app/.venv/bin/supervisord`. API and worker both RUNNING.
- Markdown, PDF and DOCX each completed background ingestion with one embedded chunk and one successful scoped vector-search result.
- Forced worker SIGKILL changed its PID from 10 to 73; Supervisor returned it to RUNNING and `/readyz` remained ready.
- Container SIGTERM stopped both processes and exited 0 in 1.266 seconds, without forced timeout. Logs include both `stopped: rag-worker` and `stopped: rag-api`.

See `issue-440-runtime.json` for the observed process/health/exit result. The probe's first kill attempt used an absent standalone `kill` executable in the slim image; it was corrected to Python's `os.kill`, then the complete probe passed.

Remaining: unchanged production Dockerfile build and upstream CI/production verification belong to the integrator; the former was blocked by the explicit tokenizer-download 403 and then VFS disk exhaustion, not reported as passed. These assembled-image measurements establish local filesystem/package/process behavior, not a release artifact receipt.
