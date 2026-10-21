# Producer 3.7 controlled-provider fixture correction

Base: `6112cd401689c52f3665c0565d8d3a6b091ba580`. This task changes only the four owning integration fixtures and evidence, using the formally published runtime 3.7.0. No production data or provider is used.

## Failure model recorded before changes

The saved producer CI log has six failing cases in `available-capabilities`, `runtime-auxiliary-latency` (two), `runtime-model-context`, and `runtime-nonthinking` (two). Source inspection of the formal driver's public wire contract confirms that ordinary agent turns now require `{"commentary":"","answer":"…"}` and set `response_format.type=json_object`. The controlled providers still send plain answer strings, or mistake every JSON-object request for an auxiliary review. The nonthinking fixture also asserts the obsolete absence of the main request's response format.

The correction must not weaken the producer/parser, turn off purpose framing, or route auxiliary structured/compaction replies through the answer envelope. A partial answer must still appear before provider completion; hidden reasoning and raw tool arguments must remain absent; authorization, delivery-once, exact retry/settlement counts and repeated-compaction continuity assertions must stay intact. Tests must recognize the explicit purpose wire contract in the main system instruction, not equate transport streaming or JSON mode with a call's purpose.

## Result and scope

All six owning cases passed against formal 3.7.0 and isolated local PostgreSQL/Redis. This is fixture compatibility evidence, not a live-provider quality or latency claim. Product source, runtime parser, producer configuration, dependencies and migrations are unchanged.

- `ci-red.json` records the six original CI failure names and hashes the successfully downloaded log. Its denied upstream job resource was not retried.
- `local-red.log`: original three short files, 0/4 passed, exit 1. The two existing nonthinking CI timeouts (60/120 seconds) were not repeated locally before correction.
- `owning-green-attempt.log`: after protocol correction, 5/6 passed. Both auxiliary/retry cases, repeated compaction and both nonthinking cases passed; the capability case advanced beyond greeting and exposed an old IM/auxiliary fixture issue.
- `available-owning.log`: corrected capability fixture, 1/1 passed, exit 0. The same four scenario and measured-ledger assertions remain. It now uses the existing HTTP recording IM fixture, whose signal-scoped client remains functional; its deferral response checks the decoded auxiliary input's `findings` array instead of searching escaped request JSON.
- `fixture-results.json` records the synthetic outcomes: exactly-once receipts and settlements, preserved continuity, first answer before closed JSON/provider completion, live/replay identity and authorization assertions, and unavailable-reference repair. Generated historical tracked artifacts were restored rather than committed.
- `typecheck-final.log` and `biome-final.log` are the final server compile and four-file lint receipts. `lint.log` retains an initial unsuccessful invocation of absent ESLint; the repository uses Biome. `final-checks.json` binds the four tested sources and evidence hashes.

The first combined run's three unchanged files' five passing cases were not rerun after the final correction confined to `available-capabilities.test.ts`; that file was rerun alone. Thus “six passed” describes the union of these exact-source results, not a falsely claimed single green full-suite run. Normal full CI remains the integrator's release gate. Shutdown `control plane stopped` diagnostics in the logs are teardown messages; test outcomes and exit codes are retained without filtering.

## Reproduce

Use Node 22 and the exact lockfile's formal `@lyyzka/lingxios@3.7.0`, whose registry gitHead is `6e715df85de9e6fa4d852d9102772e5c3ca4e8a7` and tarball SHA256 is `337f2ccdbbcb5c0d18f4349a0963386f6c5cdeaeb033582e94da0ca7bc07769f`. Locally this was the already qualified registry install under `/workspace/public-purpose-contract/formal370`, not a source overlay. PostgreSQL used a task-owned loopback-only `pgvector/pgvector:pg16` container with tmpfs data, a `producer370_test` database and a separate task-owned Redis 7 container; no production connection or credential was used.

Set `DATABASE_URL` and `INTEGRATION_DATABASE_URL` to that dedicated test database, `REDIS_URL`/`LINGXIOS_TEST_REDIS_URL` to isolated Redis, and the synthetic integration environment listed in `.github/workflows/ci.yml`. Set `OPENAI_BASE_URL=http://127.0.0.1:1/v1`, disable live fixture flags and embeddings, and use a nonexistent `DOTENV_CONFIG_PATH`. The controlled providers override the endpoint; the compaction case intercepts its fixed synthetic provider request.

```sh
node --import tsx server/src/migrate-bin.ts
node server/run-integration-tests.mjs --file available-capabilities.test.ts --file runtime-auxiliary-latency.test.ts --file runtime-model-context.test.ts --file runtime-nonthinking.test.ts
npm run server:typecheck
node node_modules/@biomejs/biome/bin/biome lint server/src/__integration__/available-capabilities.test.ts server/src/__integration__/runtime-auxiliary-latency.test.ts server/src/__integration__/runtime-model-context.test.ts server/src/__integration__/runtime-nonthinking.test.ts
```

Log lines in `local-red.log` and `owning-green-attempt.log` have trailing spaces removed only, so repository whitespace checks remain clean. Original bytes remain in commit `366888d4c574e1f60551c9d99ea54fc8afc99d1a`; `final-checks.json` records their original SHA256 separately. No outcome, diagnostic or exit code was removed. The earlier source-only diff check did not include then-untracked evidence logs; the final complete candidate check covers both source and evidence.
