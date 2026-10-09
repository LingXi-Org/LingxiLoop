# LingxiLoop end-to-end verification

Browser tests use [tester-army/e2e](https://github.com/tester-army/e2e) 0.17.0 and its official `@e2e-dev/web` 0.12.0 engine. Tests use exact user interactions and assertions; no model subscription or API key is needed. Browser responses are not mocked. Run `npx e2e guide` for the installed framework documentation. Do not import or run Playwright directly.

## Disposable local environment

Requirements: the repository's Node.js 22 runtime, installed npm dependencies, and Docker. All published container ports bind to loopback. These fixtures never load the developer's `.env.local`. The browser and integration databases are separate; integration tests truncate only the latter. The API uses real PostgreSQL, Redis, WuKongIM, and S3-compatible MinIO storage. The control plane uses its actual Worker and an isolated local D1 database.

```sh
npm run test:e2e:install
docker compose -f e2e/server/compose.yaml up -d --wait
docker compose -f e2e/browser.compose.yaml up -d --build
```

Copy `.env.e2e.example` to `.env.e2e.local`. In two separate terminals, start:

```sh
npm run test:e2e:api
npm run test:e2e:control
```

The API command creates/migrates `lingxiloop_browser_test`, seeds synthetic teacher/student accounts, a classroom, published learning activity and active seats, creates the storage bucket, then starts the ordinary Web/API process. It also seeds a separate company and sacrificial accounts for administrator lifecycle tests. The control command migrates and seeds only `.e2e/control-state`. Both commands load only `.env.e2e.local` for fixture options. Browser mutation tests add synthetic records to this disposable database.

For course channel synchronization and knowledge ingestion, run `node e2e/local-api.mjs --worker` in a third terminal. This starts the actual learning, IM reconciliation and knowledge queue workers separately from the API; live agent execution is excluded. Knowledge tests additionally require [the isolated Notebook service](knowledge/README.md) and `E2E_KNOWLEDGE=1` in both service terminals and `.env.e2e.local`. Dedicated administrator fixtures live in a separate company and use the `manager` account.

Then run:

```sh
npm run test:e2e:typecheck
npm run test:e2e
npm run test:e2e:web -- --tag public
npm run test:e2e:admin -- --tag public
npm run test:e2e:server
```

The browser runner builds into `.e2e/dist-web` or `.e2e/dist-admin`, then starts/stops its own Vite preview server: Web `127.0.0.1:5180`, Admin `127.0.0.1:5198`, proxied to the test Worker `127.0.0.1:8797`. The test build uses Cloudflare's public Turnstile test key. Do not run another server on those ports. `E2E_BASE_URL` instead selects an already running environment and suppresses automatic startup. `E2E_API_URL` overrides the local Vite proxy target. Tests that mutate records require `E2E_MUTATIONS=1`; use disposable accounts and data.

WebSocket connections go directly to the Web/API process at `ws://127.0.0.1:5181` and retain ordinary one-use ticket authentication. The control Worker serves HTTP routes only. `E2E_WS_URL` overrides this separate WebSocket target.

If the browser download CDN is unavailable, `E2E_CDP_URL` can point to a separately started, isolated Chromium browser. The official e2e engine still performs all browser operations, in a fresh context for every attempt. For example on Windows:

```powershell
Start-Process 'C:/Program Files/Google/Chrome/Application/chrome.exe' -WindowStyle Hidden -ArgumentList '--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9227',"--user-data-dir=$PWD/.e2e/chrome",'--no-first-run','about:blank'
$env:E2E_CDP_URL='http://127.0.0.1:9227'
npm run test:e2e
```

`E2E_WUKONG_IMAGE` can select a prebuilt WuKongIM image instead of rebuilding the pinned source with Docker; omit `--build` in that case. Use the version matching `server/wukongim/wukongim.toml` and the production protocol.

## Evidence and coverage

- `.e2e/web/` and `.e2e/admin/`: native `report.json`, `junit.xml`, `summary.md`, and retained failure traces/screenshots. These are ignored because browser sessions can contain credentials. The framework redacts configured credential values.
- `artifacts/e2e/server-validation.json` and `server-integration.log`: repeatable isolated API/worker integration results. Integration fixtures simulate WuKongIM and storage; this is separate from the real browser environment.
- [Web flow map](web/FLOWS.md) and [Admin flow map](admin/FLOWS.md) describe covered UI operations, authorization boundaries and external prerequisites.
- Eval: `npm run eval:check`. Open Notebook: `uv run --frozen --python 3.12 pytest -q` inside `third_party/open-notebook`. R2 gate: `node --import tsx --test workers/r2-gate/src/index.test.ts`.
- Control-plane contracts: `npm run control:test -- --testTimeout 60000 --hookTimeout 60000`. The recorded run uses Linux with D1 storage isolation enabled; its runtime compatibility-date limitation is recorded in `artifacts/e2e/control-validation.json`.
- Fixture connection safety: `node --test e2e/server/fixture-safety.test.mjs`; connection-string overrides must be rejected before opening a database connection.
- `node e2e/knowledge/verify.mjs` verifies the running Notebook service's real ingestion, storage, retrieval isolation, retry and deletion paths; results are saved to `artifacts/e2e/knowledge-validation.json`.

An exit code of zero from e2e can include skipped tests. Inspect the report's passed/failed/skipped counts; skipped and prerequisite-blocked flows are not verified. The fixture deliberately has no live LLM or delivery email account. Live agent completion, real OTP/email delivery and generated presentations require separately configured test services. `E2E_KNOWLEDGE=1` opts into the authored private-source workflow when the isolated knowledge service is ready; see [knowledge setup](knowledge/README.md).

Stop the foreground API, control, product worker and optional Notebook launcher with Ctrl+C after testing. Containers and their test data can be stopped with `docker compose -f e2e/browser.compose.yaml stop` and `docker compose -f e2e/server/compose.yaml stop`. This does not delete data.

Before repeating administrator lifecycle tests, run `npm run test:e2e:api -- --seed-only` while no tests are active. This restores only their dedicated fixture accounts/company/project states. The Worker seed command resets test login sessions, so run it before browser tests, never during a run. Keep the test files, configuration and `.env.e2e.local` unchanged during a run; e2e rejects configuration that changes between workers.

After a server-only fix, stop the API process and use `npm run test:e2e:api -- --api-only` to restart it with the same isolated configuration and existing fixtures. This mode does not migrate or reseed data.
