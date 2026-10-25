# Issue 447 deterministic model-input regression

The regression invokes `receiveAgentRequest`, the published LingxiOS control plane and Worker, and records `ModelDriver.run` inputs after product authorization and prompt assembly. It uses committed synthetic IM over the existing recording HTTP fixture, real dedicated PostgreSQL and Redis, and the exact locked published LingxiOS 3.8.12 package. No model provider or production service is contacted.

Baseline source: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`, archived under `/tmp/lingxiloop-447-baseline` before implementation. The baseline suite fails seven of eight tests. Its first-send failure proves that the full committed quote is absent from actual model input. The unchanged ordinary-message scenario passes. See `model-input-baseline.log`.

The fixed suite passes all eight tests with no skips and captures twelve actual model calls. See `model-input-green.log`, `model-input.json`, and `integration-timings.json`. The source quote is 503 characters and precedes 205 unrelated committed messages, exceeding both the 240-character preview and the 200-message lookup page. Checks cover initial send and replay deduplication; an actual failed model run followed by retry after refresh; delivered assistant regeneration through `sourceRef`; current persona and historical author attribution; selected quote distinct from thread root; quoted mentions preserving the sole intended target; missing and foreign-channel targets; quoted attachment content and retry; and unavailable attachment status without its bytes.

Assertions require A and original task B in the current model input group after the last assistant response, allowing the runtime's separate attachment evidence item. Earlier completed exchanges cannot satisfy the recovery assertions. Evidence stores outcomes and synthetic identities; it does not save prompts or credentials.

Reproduce against an empty dedicated fixture database:

```sh
docker compose -f e2e/server/compose.yaml up -d --wait
# Create lingxiloop_quote447_test on the fixture PostgreSQL if absent.
env -i PATH="$PATH" HOME="$HOME" bash -c '
  source docs/evidence/issue-447/integration-env.sh
  node --import tsx server/src/migrate-bin.ts &&
  node server/run-integration-tests.mjs --file agent-quote-model-input.test.ts
'
npm run server:typecheck
```

The existing default integration database has partial historical migrations and was left intact. This run created and migrated only `lingxiloop_quote447_test`. The preinstalled 3.5.2 dependency trees were replaced using the existing lockfile and published registry; the stale nested server dependency tree is retained at `/tmp/lingxiloop-447-server-node_modules`, and tests resolve the root dependency tree as CI does.
