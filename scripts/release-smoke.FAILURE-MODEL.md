# Production smoke failure model

Before changing the production smoke, account for these failures:

- A current product exposes the public LingxiOS runtime/schema/protocol versions;
  the retired `reasoningRuntime: null` expectation must not reject that release.
- A missing runtime or mismatched runtime/schema/protocol must fail admission.
- A correct runtime cannot excuse a different deployed commit or product version.
- HTTP failures may contain credentials or user data in their body; report only
  the route and status, never the body or supplied session cookie.
- Invalid authentication, tenant membership, dependencies, channel-list shape,
  missing WebSocket tickets and absent authenticated hello must still fail.

Run the real smoke CLI against a deterministic transport fixture first. This is
an isolated script contract test, not production, live-provider or browser proof.
Actual production verification still needs an existing authorized session, exact
release SHA, healthy dependency response and the real authenticated WebSocket.
