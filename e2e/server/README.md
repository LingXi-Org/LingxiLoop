# Isolated server verification

Run `node e2e/server/run.mjs` from the repository root. It starts dedicated PostgreSQL/Redis containers, migrates only `lingxiloop_integration_test`, then invokes the existing serial integration suite. Synthetic credentials and loopback services are fixed; developer environment files and live model/mail credentials are excluded.

Select owning files with repeated `--file` arguments. For the runtime object-store contract, include `--local-objects`; it starts the local browser MinIO service and prepares a separate private `lingxiloop-e2e-runtime` bucket:

```sh
node e2e/server/run.mjs --local-objects --file runtime-context-latency.test.ts --file runtime-nonthinking.test.ts --file runtime-objects.test.ts
```

Full results use `artifacts/e2e/server-validation.json` and `server-integration.log`. Selected-file runs use `server-targeted-validation.json` and `server-targeted-integration.log`, preserving the broad-run evidence. Inspect counts: skipped cases are not verified. Do not run two integration selections concurrently against this database.

Stop its containers with `docker compose -f e2e/server/compose.yaml stop`. Local object storage is owned by `e2e/browser.compose.yaml`; stop that stack only when browser work has finished. Neither command deletes test data.

## Live homework acceptance

Use an existing credential file, without copying it into the worktree:

```powershell
$env:EVAL_ENV_FILE = 'C:/path/to/existing/eval/.env.local'
node e2e/server/homework.mjs --live-homework --check-config
node e2e/server/homework.mjs --live-homework
```

Both `EVAL_CANDIDATE_*` and `EVAL_JUDGE_*` require `BASE_URL`, `MODEL`, `API_KEY`, `INPUT_CNY_PER_MILLION` and `OUTPUT_CNY_PER_MILLION`. The judge model must differ. The config-only check starts no service or model call. The live run uses real providers, normal Better Auth, the production web and worker entrypoints, WuKongIM, local MinIO and the official `@e2e-dev/web` browser engine. It seeds synthetic identities and a course; learning records, reports and submissions must arise from the browser journey. It resets only `lingxiloop_homework_model_test`, so do not run two homework acceptances concurrently.

The live stack has separate ports and Redis database 5; each Node process has a PostgreSQL pool limit of eight. Each agent run is bounded to 16 model calls, 200,000 tokens and USD 0.50; the provider meter reserves costs before forwarding and caps the complete evaluation at USD 5 converted at the established 7 CNY/USD rate. Explicit prices are estimates, not verified provider invoices. Missing or unmeasured usage fails closed.

For diagnosis when the host network prevents real public webpage access, add `--documents-only`. This selects the PDF/DOCX/text journey while leaving public webpage access explicitly unverified. Even a passing selected run records `scope: documents-only`, `releaseReady: false` and `requiredUnverified: [public-webpage]`; it cannot satisfy full live acceptance. The default remains the complete public webpage and document journey. Do not disable DNS or TLS protections to make the complete journey pass.

`E2E_HOMEWORK_PUBLIC_URL` may select another readable public triangle-area reference; it defaults to the Math Is Fun triangle-area page. The launcher accepts one credential-free HTTP(S) URL, and the product's normal DNS, SSRF and TLS checks still apply. Full acceptance requires an actual extracted-material receipt for that exact URL.

Evidence is written to `artifacts/homework/<commit>/<run-id>/`. Inspect `results.json`, `browser-proof.json`, the official browser report, `semantic/`, `run-metadata.json` and `source-manifest.json`. Official e2e disables pixel capture after a secret fill, so authenticated journeys record labelled controls/layout facts and explicitly mark pixels as not captured. Actual screenshots come from the separate visual suite. All required cases must finish, with zero failures and skips; incomplete runs are failures. Source hashes use sorted file paths and actual file bytes, exclude generated evidence/local shims, and must remain unchanged throughout the run. Re-run final acceptance after any source changes. Raw private conversations and credentials are excluded from structured receipts and judge conclusions. Stop the separate service stack with `docker compose -f e2e/homework/compose.yaml stop` after verification; the launcher stops its own Node child processes.

The incomplete-learning, returned-revision and brief-proficiency paths each end in a real answer/report submission and teacher decision. Any genuine learning record permits submission; mastery and assessment-tool calls are not prerequisites. Returning work requires a current report but no additional learning record. Reports must preserve uncertainty, assistance and missing evidence. An unreadable authorized learner attachment or invalid model result yields an explicitly unverified report; unauthorized material remains inaccessible. Negative checks include an empty private thread and a real uploaded attachment containing untrusted override instructions. The actual report-model request must include the extracted file, proven by content hashes. At least one validated model report and the independent semantic judge are required. Provider receipts include only bounded known field types, counts, lengths, hashes and grounding booleans; diagnostics never change provider traffic or validation.

Release recovery: the Komodo procedure stops only the old application `worker` services on both A/B stacks after Knowledge and before Application A/B, so old workers cannot consume new homework effects during migration. Once migration 0039 is applied, an older immutable image containing only migrations 0001–0038 fails the migration-current guard because applied migration 0039 has no matching file. Prefer a forward fix. A business rollback needs a rebuilt, revalidated image retaining migration 0039 and compatible `HOMEWORK` state/effect handling; never delete the migration record or drop homework data to make an old tag start.
