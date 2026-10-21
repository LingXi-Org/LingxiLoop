# Second-stage native public-purpose producer

Refs #275 and #280. This is the continuation of PR282, dependent on reader PR284. Formal reader base `0cc285f5ef9ab4593e092115897ee24b7f9f550b`; implementation `c3aac31a9123a17872db9dd206e2b96a57b7bef3`. A normal merge preserves PR282's `bcd14919` history; its conflicting hardcoded producer override was discarded in favor of the final reader's single configuration source. No history was rewritten.

Relative to that reader, the only product change is `publicTextDeployment.producer: disabled → purpose-json-v1`. `publicTextModelOptions()` already supplies the real Worker configuration and reader capability validation already uses the same immutable leaf. The runtime configuration, formal 3.7.0 dependency/locks, migration files, migration runner and release driver are unchanged. Product0051/native14 reader qualification remains owned by PR284.

## Focused evidence

The failure model precedes test and option changes. The two enabled-configuration expectations first failed against the reader-only leaf: metadata reported disabled and the actual `runtimeModelConfiguration` omitted the protocol. After changing only the leaf value, **11/11** owning cases passed in **3.042 seconds**, with no forced process exit. They check:

- The immutable leaf reaches the normal Worker model options without changing request/first-byte/idle/recovery/thinking/tool-parallelism limits.
- A declared commentary chunk has its correct purpose immediately. A declared answer and its continuation each reach the actual assistant transport decoder while the synthetic input stream is still open; the answer keeps one stable identity.
- Existing same-attempt tool/answer, failed-attempt supersession, accepted/repair history and inert unverified-reference boundaries remain covered.

These tests use formal installed runtime3.7.0, actual public reducers/product projection and actual SSE decoding, with synthetic native events. The configuration test invokes the real product configuration function. They do **not** invoke a real Worker, database, browser or provider; provider framing is covered by the separately qualified upstream release. Server typecheck and targeted three-file Biome lint passed. An initial sparse-checkout attempt lacked the tracked visualization asset; that environment error was resolved before the complete two-assertion red run and is not counted as the producer defect. No dependency installation was performed; the final reader's formal installation was reused read-only.

Reproduce with Node22, the formally pinned dependencies, synthetic import-time environment variables, `DOTENV_CONFIG_PATH=/dev/null`, and `LINGXILOOP_RUNTIME_CLIENT=http` for lazy Redis initialization:

```sh
node --import tsx --experimental-test-module-mocks --test --test-concurrency=1 server/src/__tests__/public-text-deployment.test.ts server/src/__tests__/native-public-purpose.test.ts server/src/__tests__/repair-public-projection.test.ts server/src/__tests__/visualize-public-boundary.test.ts
node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json
node node_modules/@biomejs/biome/bin/biome lint server/src/agent-runtime/public-text-deployment.ts server/src/__tests__/public-text-deployment.test.ts server/src/__tests__/native-public-purpose.test.ts
```

## Release boundary

This commit prepares the producer; it is not evidence that any production reader was upgraded or production enabled. The sole integrator must first deploy the formally pinned reader with producer disabled, confirm every active Web/API/SSE/history reader and Worker is healthy on that reader, then qualify and deploy this producer commit. Exact merged-head CI/image and actual rollout receipts remain pending. After the first v2 write, disabling the producer does not permit old strict readers to return; retain compatible readers and fix forward.

Declared purpose separates commentary from answer before the first body chunk; it does not establish that arbitrary model prose is semantically labelled correctly. Legacy v1 history keeps its existing compatibility projection. Real-provider capability/semantic compliance remains unverified, and no new large-model or browser gate was run. No production or private-case data was read. Historical unpublished-overlay evidence in `../issue-280/` is retained as history and is superseded for formal qualification by the reader and this record.

Committed text-log copies normalize trailing whitespace; original local logs remain in `/tmp/issue280-producer-preparation/`.
