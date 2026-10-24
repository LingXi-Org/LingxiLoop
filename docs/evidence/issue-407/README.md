# #407 scoped terminal feedback

Base: d3c08b994888e95159795950a3394df1d9f0b9df. Product implementation only; #406 remains the separate upstream producer change.

`deliverTerminal` now reads the current root result before constructing a new terminal notification. A matching result/fence/request with an actual delivered receipt is described as an existing answer, with failed/cancelled/not-started successor counts. It does not negate that answer or claim that the complete task succeeded. Protocol and timeout copy use structured current-root `run.failed` diagnostics only; raw exceptions, IDs, prompts and elapsed time never become user-facing explanations. At most four 100-event pages share the callback signal/deadline; absent current diagnostic metadata keeps the generic classification. A successful root never inherits a child's cause.

The existing nonce, accepted payload reuse, role=system, suppressAgentWake, audience/name filtering and repeated pre-send authorization/version checks remain. The message delivery/mentions/ingest function is unchanged. No schema, runtime dependency lock, performance, context or security setting changes.

Validation:
- 6/6 focused checks (`terminal-feedback.test.ts`, `terminal-delivery.test.ts`): delivered root + failed child scope, partial result receipt boundaries, protocol/empty finishReasons, timeout, cancellation, current fence/version, bounded diagnostics, accepted-payload retry, stale suppression and zero ingest.
- 3/3 owning real local PostgreSQL/formal Worker/recording IM integration scenarios in `runtime-reliability.test.ts`: protected terminal rejection, idempotent terminal replay, failed/cancelled work and next-message recovery. Zero skipped. Local synthetic provider only.
- Four changed-file lint checks and isolated helper/test TypeScript pass; `git diff --check` passes.
- Full server typecheck was run and fails in untouched callback-deadlines/runtime-model-context tests and existing root/server Zod type identity mismatches (`server-typecheck.log`). No diagnostic names a changed file. Not reported as passed.

Exact initial CI 40079725320 passed its integration and deploy-contract jobs, but caught an overly narrow `content`-only payload type in the new terminal delivery fixture when asserting role/metadata. The fixture now uses the full NativeMessage type. This was a test-type correction; runtime behavior is unchanged. Its affected test was rerun and the server typecheck repeated; the new fixture diagnostics are gone, while the local pre-existing type mismatches remain. Latest exact-head CI remains the integration handoff gate.

Environment: Node 24.19.0; exact formal LingxiOS 3.8.11 downloaded from the configured @lyyzka registry https://npm.pkg.github.com and verified against the committed lock integrity sha512-LgZSHolbT7T3zVB1cQ8OdFcwP7rjTTX58HhlZKaDPbo+mW3WK/H46stTrlpzimtukq9YLgvIMNZH56tTLZ08Vg==. No 401 occurred. Preinstalled 3.5.2 was replaced only in ignored node_modules; manifests/locks remain unchanged.

Failed environment setup attempts were not successful checks: the first integration invocation lacked WUKONG_USER_TOKEN_SECRET; the second stopped at the pre-existing local test database's 38/54 migration mismatch. A fresh dedicated `lingxiloop_407_test` was created on localhost, migrated with the repository's ordinary migration command, and the same owning file passed 3/3. No production database or real user/provider was used. Full suite, live provider and browser checks were not run. No independent review cycle, merge, package publication or deployment was performed, per the current task instruction.

Reproduce focused checks:

```
node --import tsx --experimental-test-module-mocks --test --test-force-exit server/src/__tests__/terminal-delivery.test.ts server/src/__tests__/terminal-feedback.test.ts
node_modules/.bin/biome lint server/src/agent-runtime/terminal-feedback.ts server/src/agent-runtime/delivery.ts server/src/__tests__/terminal-feedback.test.ts server/src/__tests__/terminal-delivery.test.ts
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext server/src/agent-runtime/terminal-feedback.ts server/src/__tests__/terminal-feedback.test.ts
```

Run `npm run test:integration -- --file runtime-reliability.test.ts` only against a dedicated migrated local test DB, with synthetic required startup values and dedicated Redis. The suite truncates its explicit test target.
