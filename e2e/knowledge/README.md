# Local knowledge verification

Prerequisites: the disposable browser MinIO service and `lingxiloop-e2e` bucket from `node e2e/local-api.mjs --seed-only`, plus the vendored Python environment (`uv sync --frozen --python 3.12` in `third_party/open-notebook`).

From the repository root:

```sh
node e2e/knowledge/start.mjs
```

Keep that process running. It starts a separate SurrealDB on port `58001` with a disposable Docker volume, the current vendored RAG API on `15055`, its real ingestion worker, and a local embedding fixture on `15056`. `/readyz` on port `15055` must return HTTP 200. The launcher uses `third_party/open-notebook/data/tiktoken-cache` and stores temporary runtime files under `.e2e/knowledge`. An empty tokenizer cache requires its public asset download before the first ingestion can complete.

Run the HTTP lifecycle checks in another terminal:

```sh
node e2e/knowledge/verify.mjs
```

Results are saved to `artifacts/e2e/knowledge-validation.json`. Checks cover authentication, idempotent creation, text and real object-storage file extraction, private command arguments, tenant/notebook/source retrieval boundaries, upload metadata mismatch, failed-job retry, private-URL rejection and deletion. The retry check marks only its own completed disposable command as failed before requesting recovery. Start the browser API and product worker with `E2E_KNOWLEDGE=1` to exercise the knowledge UI against this service.

The embedding fixture returns constant 1024-dimensional vectors. It verifies queue, extraction, storage, protocol and isolation behavior; it does not verify semantic ranking or a paid provider. API, worker, SurrealDB and object storage use synthetic credentials and disposable local data. The existing native-development Notebook services are not used.

Stop the launcher with Ctrl-C, then run `docker compose -f e2e/knowledge/compose.yaml stop` to stop its isolated SurrealDB. Restart with `node e2e/knowledge/start.mjs`; the volume preserves notebook IDs referenced by the browser test database. If resetting the volume, also reset the disposable browser database so it cannot retain stale notebook/source IDs. Saved verification artifacts remain in `artifacts/e2e`.
