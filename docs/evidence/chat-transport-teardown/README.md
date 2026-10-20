# Chat transport fixture teardown

Baseline `d1b42220d88026242c293482e8adf598af6f604e`. This change only repairs four browser unit fixtures; production transport/recovery, the default runner, dependencies and release settings are unchanged.

`ChatTransport.disconnect()` aborts every stream synchronously. The mocked SSE subscriptions resolve, then the transport's streaming coroutine resumes after `await harnessApi.subscribe()`. Its abort-aware `waitForRecovery()` creates/clears a timer and the aggregate finally releases listeners. The tests deleted/restored `window` before those Promise continuations ran. The browser global survives an ordinary product disconnect; this failure establishes a test-environment lifetime error, not a browser lifecycle regression.

Each fixture now waits one `setImmediate` event-loop boundary after disconnect before deleting/restoring its browser globals or module mocks. This lets the known cancellation microtasks drain, without waiting for a retry interval or suppressing errors. The transport fixture asserts every opened subscription Promise has settled, all signals are aborted, fake recovery timers are empty, no new subscription/read is started and the cleared conversation store stays empty.

Evidence:

- `original-red.tap`: unchanged four files, 20 assertions pass but all four files fail from asynchronous activity after test completion (exit 1).
- `drain-red.tap`: subscription-settlement assertion before the wait sees only 1 of 3 subscriptions finished (exit 1).
- `final-owning.tap`: final four files plus adjacent public-history loading, **21/21** in **2.475 seconds**, natural exit 0, no after-test rejection. No `--test-force-exit`, rejection listener, catch or process-exit suppression is used.
- `lint.txt`: four changed test files pass Biome.

The first additional measurement used distinct AbortSignals as a proxy for subscription count. A reconnect reuses its run's signal, so that measurement incorrectly reported 2 of 3 after cleanup. It was corrected to count settled subscription Promises, then rerun without the wait to reproduce the true 1-of-3 red before the final green. This instrumentation correction is not a product failure.

Reproduce with the already installed dependencies and Node22:

```sh
node --import tsx --experimental-test-module-mocks --test --test-concurrency=1 src/features/chat/runtime/error-recovery.test.ts src/features/chat/runtime/history-loading.test.ts src/features/chat/runtime/run-updates.test.ts src/features/chat/runtime/transport.test.ts src/features/chat/runtime/public-history-loading.test.ts
```

The original combined run separately omitted `WUKONG_USER_TOKEN_SECRET` for the server safety test. The normal `scripts/run-tests.mjs` injects the synthetic unit defaults and also uses `--test-force-exit`. That setup error needs the normal test environment, not a product-code change. This correction intentionally does not repeat server files that initialize database/Redis clients. No provider/model, production or shared database was used. Existing dependency directories were referenced read-only; no installation was performed. The sole integrator owns subsequent combined checks and release.
