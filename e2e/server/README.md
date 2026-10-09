# Isolated server verification

Run `node e2e/server/run.mjs` from the repository root. It starts dedicated PostgreSQL/Redis containers, migrates only `lingxiloop_integration_test`, then invokes the existing serial integration suite. Synthetic credentials and loopback services are fixed; developer environment files and live model/mail credentials are excluded.

Select owning files with repeated `--file` arguments. For the runtime object-store contract, include `--local-objects`; it starts the local browser MinIO service and prepares a separate private `lingxiloop-e2e-runtime` bucket:

```sh
node e2e/server/run.mjs --local-objects --file runtime-context-latency.test.ts --file runtime-nonthinking.test.ts --file runtime-objects.test.ts
```

Full results use `artifacts/e2e/server-validation.json` and `server-integration.log`. Selected-file runs use `server-targeted-validation.json` and `server-targeted-integration.log`, preserving the broad-run evidence. Inspect counts: skipped cases are not verified. Do not run two integration selections concurrently against this database.

Stop its containers with `docker compose -f e2e/server/compose.yaml stop`. Local object storage is owned by `e2e/browser.compose.yaml`; stop that stack only when browser work has finished. Neither command deletes test data.
