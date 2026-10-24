# Local provider fixtures must preserve the model capability profile

The production-entry streaming and provider-timeout fixtures replace the provider origin with localhost. The product selects the actual provider's 1M context capability by model and origin, so this substitution silently falls back to the runtime's 128K default. With the complete tool catalog and current trusted instructions, native compaction may reject the request before the stub receives it. A 60-second preview wait or zero timeout attempts then measures fixture setup instead of streaming or retries.

Failure modes to retain in regression:

- No request reaches the stub because the fixed trusted context exceeds the mock's unintended context limit.
- Replacing `startLingxiOSWorker` with a smaller custom Worker drops the production-entry coverage.
- Increasing hard budgets, dropping tools, weakening the preview assertion, or reducing the expected three timeout requests conceals the missing coverage.
- A transport stub accidentally sends a real request, forwards an actual credential, changes abort/body bytes, or remains installed after cleanup.
- Changing origin without reflecting the real JSON-with-tools capability leaves the test asserting an incompatible response mode.

The test-only adapter keeps the exact production model/origin configuration while routing only that model endpoint to an exact loopback stub. It uses a synthetic key, refuses other external URLs, preserves the original method/options/signal/body, and restores all changed test environment fields and fetch. The product code, runtime package, catalog, budgets and deadlines are unchanged. The two owning suites retain their original behavioral checks. A terminal run before the streaming preview now reports only safe status and numeric context-limit diagnostics instead of waiting for the preview timeout.

Observed local timeout baseline: `irreducible_context`, context window 128000, hard limit 115200, estimated tokens 115765, overhead 115763, reserve 8704, request input 107059 and zero historical items. No provider request or model ledger row was created. The earlier graph qualification remains failed; this test repair is not graph or production acceptance.

The production-entry streaming baseline reproduced the same reason with estimated tokens 115763, hard limit 115200, context window 128000 and zero provider requests. The test-only transport regression was written before its implementation (the initial run failed because the module did not yet exist). It then passed 2/2; the complete streaming/visualization suite passed 2/2 and the timeout suite passed 1/1, with the original three attempts, connection cancellation and failed-call accounting retained. Both owning runs used an additional local-network-only fetch guard. Expected shutdown-time `control plane stopped` diagnostics remain in the logs; no real model request was made.
