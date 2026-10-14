# Available capability context acceptance

Issues LingxiLoop #135 and LingxiOS #21 replace the fixed product refusal
requirement from #117. Unavailable capabilities are omitted; ordinary model
truthfulness and execution authorization govern specific requests.

The product removes its specialized denial paragraph. The independent evaluation
assistant uses the same generic observed-outcome principle. `tool-initiative/5`
replaces fixed refusal wording with semantic checks for truthful unavailable
information; older versioned datasets remain historical and are not the current
acceptance specification.

## Reproduce

With installed locked dependencies, run:

```sh
npm run server:lint
npm run server:typecheck
npm run server:test
node e2e/server/run.mjs --file available-capabilities.test.ts --file agent-protocols.test.ts --file retired-product-tools.test.ts
npm run eval:check
npm run test:e2e:typecheck
npm run test:e2e:web -- --tag retirement --output .e2e/issue-135
```

The browser gate uses `tester-army/e2e` and its official `@e2e-dev/web` engine.
Provide the disposable browser fixture accounts and services documented in
`e2e/`. The opt-in browser model case requires a separate live Agent workspace;
skipped tests are not counted as verified. Real model semantics are independently
checked through the production worker below.

The server scenario uses real PostgreSQL/Redis, the installed public LingxiOS
package, the product context provider, the HTTP Worker and an HTTP model endpoint.
It inspects the exact outbound system context and tool schemas before responding.
Each case has a new conversation and stale stored grants. A fourth scripted case
attempts an invented removed-tool call. The email provider trap and product table
checks require zero effects. HTTP retirement, legacy ingress and migration
isolation remain covered by the existing retired-product-tools suite.

For **real GLM-5.2** acceptance, run the `Available capability live acceptance`
workflow on the reviewed commit, or apply `run-capability-acceptance` to a trusted
same-repository PR. It forwards the inspected provider requests unchanged, uses
three synthetic conversations, disables Python and external mail delivery, and
requires measured usage with a USD 0.25 budget per conversation. It does not modify
production data. `EVAL_CANDIDATE_API_KEY` supplies model access when configured;
otherwise the existing production Komodo identity reads only `OPENAI_API_KEY`
through `GetVariable`. The key stays in process memory and is passed directly to
the isolated test process, without deployment credentials or credential output.
Auxiliary fulfillment reviews may contain generic draft/confirmation examples;
the gate rejects specialized product denial rules there and checks the primary
assistant's default context and tool catalog for absent capability mentions.

## Evidence

- `artifacts/available-capabilities/scripted/results.json`: deterministic request
  hashes, visible tool names, zero-effect assertions and conversation boundary
  checks. Scripted replies are explicitly not evidence of semantic model quality.
- `artifacts/available-capabilities/live/results.json`: actual provider request
  hashes, synthetic answers, measured costs and final goal outcomes. The workflow
  uploads this file as `available-capabilities-<commit>`.
- `artifacts/e2e/server-targeted-validation.json`: repeatable integration command,
  selected files, counts and linked log.
- `.e2e/issue-135/report.json` and screenshot artifacts: official browser results.

No prompt payloads, credentials, or production conversations are retained.
Unavailable actions must remain unsatisfied; a truthful explanation is not an
execution receipt. Acceptance does not depend on a fixed product refusal phrase.
