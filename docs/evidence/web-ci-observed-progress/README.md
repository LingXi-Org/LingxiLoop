# Correct next-request status fixtures

The merged Web job [119017669848](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39537559334/job/119017669848) passed lint and failed 2 of 65 tests at base `dcd71bd269bcc9281e95bc85fa9263766456ad8f`. Both failures were old empty-content expectations in `run-updates.test.ts` (original lines 179 and 327).

The public projection now intentionally shows factual leased/queued status commentary. The tests now assert that exact single part, including its current `observed-progress:2:2` identity. Whole-content equality continues to reject prior answer text, citation parts/evidence, and old activity identities. The failed-run case also explicitly verifies that the old safe error is cleared. The subsequent queued-preview empty-content assertion remains unchanged and passes. Production code and dependency locks are unchanged.

Using the existing read-only formal runtime **3.6.0** dependencies and Node **v24.19.0**, the same owning file reproduced **15 pass / 2 fail**, then passed **17/17** after the fixture correction. Targeted Biome lint passed for the changed file. Tests exited normally without `--test-force-exit`; a 30-second process deadline bounded both local runs. No full suite, browser, provider, database, production, or dependency installation was run. Final merged-head CI remains the integrator's gate.

The local command was `node --import tsx --experimental-test-module-mocks --test --test-concurrency=1 src/features/chat/runtime/run-updates.test.ts`, with `DOTENV_CONFIG_PATH=/dev/null` and the synthetic defaults used by `scripts/run-tests.mjs` (OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL, WUKONG_USER_TOKEN_SECRET, DATABASE_URL, REDIS_URL, R2_* and LINGXILOOP_INVITE_BASE_URL). Lint: `node node_modules/@biomejs/biome/bin/biome lint src/features/chat/runtime/run-updates.test.ts`.

`receipt.json` records the exact source and evidence hashes. The CI excerpt contains only the two failures and check summaries; the source job's original full-log hash is retained in the receipt. Copied text logs have trailing whitespace removed. The previous, denied PR271 log request was not retried.
