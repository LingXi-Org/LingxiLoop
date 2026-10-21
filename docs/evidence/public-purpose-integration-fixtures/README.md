# Public-purpose integration fixture correction

Refs #275. Base `b8f29ef32360ad7569174145b6a206c18be6b9ca`; fixture implementation `5432fe5494fce8bdd83d8c0c856568b48992927e`. Product implementation, dependency locks, migrations and timeouts are unchanged.

[CI run 39623951322](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39623951322) ended with **360 passed, 2 failed, 5 timed out, 14 skipped**. `ci-red.txt` preserves the five 20-second timeout records, their asynchronous teardown errors, the two old prompt assertion failures and the final counters. The first durable prefix was already visible with purpose `answer`; the old `commentary`-only test gate prevented the synthetic driver from continuing. The other two tests expected a removed process-in-body instruction.

The fixtures now assert the actual contract: initial answer candidate is visible and running before tools; tool/replacement evidence moves its same public identity to commentary; cancellation and revocation preserve only the earlier authorized partial answer; private/blocked deltas remain excluded. Unsafe replacement still requires a valid committed answer, result/fence agreement and preserved safe-prefix history. Accepted streamed finals remain single-copy across SSE and reload. Prompt assertions require process through `chat.report_progress` and substantive answers streaming in ordinary response text. Existing real stream, failed-tool, privacy, authorization and history checks remain.

Validation used existing formal runtime **3.6.0**, Node **22.23.3**, the parent-owned dedicated local PostgreSQL/Redis fixture and synthetic/local HTTP drivers. The standard integration runner selected only these three files, with file concurrency 1: **7/7 passed, 0 failed/cancelled/skipped, 22.133 seconds**, exit 0. Server typecheck and Biome lint over the three changed files passed. Commands:

```sh
node server/run-integration-tests.mjs --file durable-public-activity.test.ts --file memory-public-streaming.test.ts --file visualize-failure-public-streaming.test.ts
node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json
node node_modules/@biomejs/biome/bin/biome lint server/src/__integration__/durable-public-activity.test.ts server/src/__integration__/memory-public-streaming.test.ts server/src/__integration__/visualize-failure-public-streaming.test.ts
```

The dedicated synthetic environment is required; do not target development or production data. The runner's existing `--test-force-exit` behavior was unchanged. First local attempts lacked tracked sparse-checkout imports; these failed before test assertions and were corrected by materializing the tracked files, without installation or product changes. An initial wrong ESLint command found no module; the repository uses Biome, whose actual result is recorded. No full suite, external provider, browser or production action was performed. Exact combined-head CI remains the integrator's gate; these focused checks do not claim that full CI passed.
