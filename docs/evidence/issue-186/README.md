# Issue #186: GLM-5.3-Flash default model

This branch prepares the production switch to the exact identifier
`zai-org/GLM-5.3-Flash`. It does not deploy, change credentials, or mutate production
state. The sole integration session owns the release and post-release verification.

## Provider and pricing evidence

The authenticated SiliconFlow CN `/v1/models` response listed the exact model, and
real generation returned that same identifier. The [official catalogue](https://www.siliconflow.cn/models)
identifies tool support and 1024K context; the runtime conservatively retains its
1,000,000-token window. The [official CN price page](https://www.siliconflow.cn/pricing)
lists CNY 0.80 input, 2.80 output and 0.23 cached input per million tokens.
[The retained extraction](../../../artifacts/issue-186/pricing.json) includes the
retrieval time, HTML hash, embedded price records and K-to-million conversion.
International prices are a separate tariff and are not used.

Both Web/API utility calls and Agent observations now use the same cache-aware
CN tariff and explicit CNY-per-USD conversion. At the observed exchange rate of 7,
uncached admission rates are 114286/400000 micro-USD per million input/output
(rounding upward). Historical model tariffs remain available. Missing/invalid
required provider usage is unmeasured; malformed cache counts are unavailable.
Every issued call retains its ledger record. Provider invoices remain authoritative.

## Configuration scope

- Server defaults, A/B shared Web/Worker Compose environments, the local MVP,
  environment examples and current live acceptance entrypoints select the new model.
- The reviewed Komodo resource source explicitly pins `OPENAI_MODEL` and clears
  old admission overrides so current tariffs are derived, without changing stored
  credentials or variables.
- [Read-only pre-release inspection](../../../artifacts/issue-186/config-before.json)
  found old Komodo admission values 1142858/4000000, rate 7, and production embedding
  `BAAI/bge-m3`. Sigillo prod supplied no model/pricing overrides after inherited
  shell values were removed for the inspection. Runtime container environments
  still require release-session verification.
- Embedding and image wiring is unchanged. The test environment's embedding value
  is different from production and is not copied to production.

[Z.ai's documentation](https://docs.z.ai/guides/vlm/glm-5.3-flash) describes mandatory
thinking. SiliconFlow accepts the existing disable-thinking request but still
returns metered reasoning tokens. Native LingxiOS 3.5.2 separates that field from
visible content; the published runtime is unchanged. The first two full real
Worker attempts timed out on a continuation at the former 90-second limit.
Their [first](../../../artifacts/issue-186/live/first-attempt-failure.json) and
[second](../../../artifacts/issue-186/live/second-attempt-failure.json) failure
records are retained, including unmeasured failed-call estimates.

The new model's default attempt timeout is 180 seconds; its logical recovery
window is at least that long. A full-duration timeout consumes that window; this
is not three 180-second attempts. Earlier failures can retry up to the existing
three-attempt limit. First-byte/idle limits, production work/token/cost budgets,
authorization and container security are unchanged. Explicit timeout overrides
remain effective.

## Executed validation

[Check counts](../../../artifacts/issue-186/checks.json): server lint/typecheck,
107 server tests, 8 lifecycle tests, 19 deployment contract tests, 4 owning
integration tests, and one 26-turn scripted context/compaction test. None skipped.
Tests exposed the pricing and configuration failures before implementation.
The [merged-head checks](../../../artifacts/issue-186/merged-checks.json) repeat
the 138 affected unit/configuration/integration checks after upstream Worker
startup cleanup was merged. Context-compaction coverage from the first validation
remains applicable; that code was unchanged by the merge.

The [successful real acceptance](../../../artifacts/issue-186/live/2026-10-19T09-42-30-278Z-15417/result.json)
used the actual product Worker, isolated PostgreSQL, the published SDK and the
existing authorized SiliconFlow key. It verified `files.list`, tool-result
continuation, a 987-character final answer, 96 incremental previews, no final
retraction, durable replay, and a separate completed JSON utility response.
All four provider calls were measured and used the exact model. Agent ledger cost
was USD 0.00405314; the utility call was USD 0.00005526. Total harness time was about
63 seconds. This passing sample does not erase the two failures or establish a
production latency/reliability distribution. IM/storage are fixture services;
this is not an online production end-to-end check.

After merging upstream Worker startup cleanup (`97441ba3`), the
[next real run](../../../artifacts/issue-186/live/2026-10-19T09-47-28-128Z-22076/acceptance.json)
completed the tool flow and final answer, but failed the original all-calls-measured
assertion. Its [diagnostics](../../../artifacts/issue-186/live/2026-10-19T09-47-28-128Z-22076/diagnostics.json)
retain a structured-call timeout followed by successful recovery, with an
unmeasured USD 0.005311 conservative estimate for the failed attempt. This is
distinct from the earlier two terminal timeouts. The test now requires measured
usage and correct tariffs for successful calls, validates every measured call,
and checks unmeasured failures retain their classification, estimate and successful
logical retry; Agent failures must also retain the SDK pricing snapshot. Host
retries are counted separately and every attempt is retained. The total recorded
cost cap includes failed attempts. A host failure with unavailable usage has no
known charge; its zero recorded estimate is not proof of a free provider call.
No production retry settings were changed for this test-contract correction.
Measured usage still yields a tariff-based cost estimate; the provider invoice
is authoritative, so `cost_estimated` remains true even for measured calls.

The [final reviewed-code acceptance](../../../artifacts/issue-186/live/2026-10-19T09-53-51-118Z-30734/result.json)
passed in approximately 58 seconds: 37 previews, a 763-character final answer,
tool-result continuation, durable replay and host JSON completion. All four
calls had measured usage, costing USD 0.00470566 for the Agent and USD 0.00002246
for the host call, with no failed attempts in this sample. The intermediate
[75-second pass](../../../artifacts/issue-186/live/2026-10-19T09-51-54-138Z-28163/result.json)
is also retained. The final acceptance code handles both first-attempt success
and recovered attempts without labelling unavailable usage as measured.

Reproduce from the repository root with root dependencies installed and Docker:

```sh
npm run server:lint
npm run server:typecheck
npm run server:test
node --import tsx --test server/src/__tests__/process-lifecycle.test.ts
node --test scripts/production-model-contract.test.mjs scripts/production-rag-contract.test.mjs
node e2e/server/run.mjs --file model-pricing.test.ts --file runtime-nonthinking.test.ts --file runtime-provider-timeout.test.ts
node e2e/server/model-context.mjs
# Existing SiliconFlow OPENAI_API_KEY in the environment; no key files or arguments.
node --use-env-proxy e2e/server/model-switch.mjs --live
```

The live runner checks model availability, uses only the local disposable
`lingxiloop_streaming_test` database, keeps per-attempt artifact directories, and
fails on absent credentials, skipped/stale results or failed assertions. The
scripted integration runner uses its separately named local test database.
Do not run two copies against the same test database concurrently.

The cloud initially exposed both root and nested server installs: their lockfiles
contain different Zod/@types versions, causing seven type errors also reproduced
on the unchanged base. The standard root installation layout passes; this change
does not alter dependency locks or another session's installation.

## Release handoff

The integration session must publish the reviewed image, sync the reviewed Komodo
resource source and deploy through the existing Actions/Komodo workflow. Confirm
both A/B Web and Worker model/base URL, derived prices, exchange rate, 180-second
request timeout, unchanged embedding/image values, readiness and image digests.
Verify a real production Agent stream/tool completion and its ledger using those
actual running configurations. Capture the Komodo terminal update ID and result.
No production release or post-release evidence is claimed by this branch.
