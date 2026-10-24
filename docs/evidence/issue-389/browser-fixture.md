# Issue 389 focused browser fixture

The regression is `e2e/cases/draft-visibility.e2e.ts`, collected by `e2e.cases-draft-visibility.config.ts`. It covers teachers' default reading and explicit management, student management denial, and published snapshot isolation after a new draft revision. Other existing case tests only adapt their teacher authoring URLs/API reads to explicit management; they are not part of this execution.

All data and credentials below are synthetic. Do not source a real `.env`.

## Local task services

```sh
docker run -d --name issue-389-cases-postgres --label lingxiloop.task=issue-389 -e POSTGRES_PASSWORD=lingxiloop-e2e-local -p 127.0.0.1:55432:5432 pgvector/pgvector:pg16
docker run -d --name issue-389-cases-redis --label lingxiloop.task=issue-389 -p 127.0.0.1:56379:6379 redis:7-alpine
docker exec issue-389-cases-postgres pg_isready -U postgres
docker exec issue-389-cases-postgres psql -U postgres -c 'CREATE DATABASE lingxiloop_cases_auth_test'
docker exec issue-389-cases-postgres psql -U postgres -c 'CREATE DATABASE lingxiloop_cases_browser_test'
```

Local images used: PostgreSQL `sha256:f1447071e6c8449dcf4056aa0994c81d3566ce5ee232de36b04dc25696a116dd`; Redis `sha256:f84b0c4678011602b9b98c227a4dcd5468bf8b088b02fdd4165cb7758bad8058`.

The server regression uses `lingxiloop_cases_auth_test` and Redis database 6. Browser fixtures use `lingxiloop_cases_browser_test` and Redis database 5, with the existing fixture's database-name guard. Tests never read any other database. The existing API fixture truncates only its synthetic browser test database and uses synthetic identities, in-memory object storage and recording messaging.

## Reproduce from the repository root

Install the exact root lockfile as CI does. Remove an obsolete nested server installation from module resolution, or synchronize it with its own lock when testing that separate installation layout. The runtime package used by the server must match both manifests/locks; migrations intentionally refuse mismatches. Final branch validation used the root-only CI installation layout.

```sh
env -i PATH="$PATH" HOME="$HOME" bash -c 'source docs/evidence/issue-389/integration-env.sh; node --import tsx server/src/migrate-bin.ts'
node node_modules/typescript/bin/tsc -p docs/evidence/issue-389/tsconfig.e2e-focused.json
E2E_TELEMETRY_DISABLED=1 node node_modules/e2e/dist/cli/bin.js list --config e2e.cases-draft-visibility.config.ts
node docs/evidence/issue-389/run-browser.mjs
```

The browser runner whitelists process infrastructure variables, supplies synthetic application credentials, disables embeddings, applies browser-test migrations, starts the existing real API fixture on localhost 53107 and Vite on 53108, and launches system Chromium with its normal sandbox on CDP 9339. The official `@e2e-dev/web` engine owns test operations. Exactly one workflow runs with zero retries. Results and screenshots are written beneath `artifacts/issue-389`; this is neither production verification nor an expanded browser matrix.

## Preparation results

- Focused TypeScript check of the three affected case E2E files passed.
- Official E2E collection selected exactly the single draft-visibility workflow.
- Full E2E typecheck was attempted while the nested server dependency tree still contained the old installation. It failed in forum/react-delivery/server dependency types; no case E2E error was reported. That old-environment result is retained at `artifacts/issue-389/e2e-typecheck.log`; the full matrix is not rerun for this focused change. The three affected case E2E files and focused config passed their own TypeScript check after both trees were synchronized.
- First auth migration stopped before schema writes because root installed LingxiOS was 3.8.12 while server installed 3.5.2. Both manifests and locks specified 3.8.12. The parent synchronized the server tree with its official lockfile; both isolated databases then applied migrations 0001–0055 successfully. The early fixture block was an old local installation, not a product failure or a defect in the formal package. No dependency or migration guard was bypassed.

## Final browser result: blocked before test execution

One attempt launched the real API and Vite fixtures successfully. System Chromium then aborted during normal sandbox startup: the SUID helper at `/usr/lib/chromium/chrome-sandbox` is not owned by root with the required mode. Its startup output is retained in `browser-chromium-startup.log`. This is an execution-environment failure, not a browser assertion failure or an automatic approval rejection.

The official E2E run command was never reached: one workflow collected, zero tests started, zero browser assertions, zero screenshots, zero retries. No official run ID or official runner exit code exists for this attempt. No old screenshot substitutes for the missing evidence. The parent instructed that this environment must not be retried, sandbox flags must not be disabled, and system helper/security settings must not be changed.

The API/Vite/Chromium processes belong only to this attempt and are cleaned up by the wrapper. The PostgreSQL/Redis containers remain available for the parent thread's isolated owning checks. `browser-result.json` records final wrapper status and cleanup; `browser-source-hashes.json` fingerprints the affected E2E files/config and runner sources. The reusable runner now detects signal exits immediately; the executed attempt source was preserved at `artifacts/issue-389/run-browser-attempt.mjs` before that diagnostic-only improvement.

Unexecuted: the targeted browser workflow's teacher reading/management switching, student forced-management denial, and snapshot-isolation UI assertions; all other case/browser E2E flows and the broader browser matrix. Focused compilation and collection passing do not establish these browser assertions as passed.
