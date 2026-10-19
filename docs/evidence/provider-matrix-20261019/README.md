# Product provider-fault acceptance, 2026-10-19

Baseline: product `97441ba3648e3c2391608707c6f2f402e9f766f2`, exact published LingxiOS3.5.2/schema12. New coverage uses real loopback HTTP sockets, published Worker APIs, a fresh local PostgreSQL database, the product shared LLM ledger and recording WuKong HTTP delivery. No paid provider calls or production operations occurred.

The new five-case selection passed **5/5, zero failures/skips**. The final combined six-file selection passed **14/14, zero failures/skips**, in50.3 seconds. Server typecheck and owning-file Biome lint passed. [Execution receipt](execution.json), [full TAP](integration.log), [five-case counters](product-fault-results.json), [no-response counters](provider-timeout.json), [total-deadline counters](deadline.json) and [402/cancel counters](terminal.json) retain the evidence.

## Added product-boundary coverage

| Trigger | First request's HTTP attempts / failed attempts | Required result and observed accounting |
| --- | --- | --- |
| HTTP429 + Retry-After, twice, then healthy | 3 / 2 | succeeded; 3 distinct settled ledger calls; sanitized rate_limit diagnostics |
| HTTP503 twice, then healthy | 3 / 2 | succeeded; 3 distinct settled ledger calls; sanitized unavailable diagnostics |
| Socket destroyed twice, then healthy | 3 / 2 | succeeded; 3 distinct settled ledger calls; network/UND_ERR_SOCKET retained |
| SSE starts then socket closes, every attempt | 3 / 3 | failed without result; no partial text falsely committed; 3 settled calls; one terminal notice |
| Empty completed SSE, every correction | 3 / 3 | failed without result; bounded native protocol correction; 3 settled calls; one terminal notice |

Each scenario then sends a new human message through public conversation ingress and asserts succeeded, persisted answer, delivered result and zero queued/leased/waiting work. Failed cases retain exactly one notice after the next turn and suppress Agent wake; no feedback-created extra work exists. The ledger does not retain injected private body markers, the synthetic key or the truncated text. Empty-output failures are nonretryable protocol failures at the provider boundary; the three calls are the existing bounded native correction path, not a new generic retry layer.

This fixture uses chat mode, so a recovered answer needs one generation and no auxiliary review call. Initial harness execution incorrectly expected a fourth call and reused a single membership across distinct companies. Those fixture mistakes caused0/5; their [original log](initial-harness-failures.log) and [execution receipt](initial-harness-execution.json) remain. The corrected harness uses the actual chat contract and distinct synthetic principals; no product implementation was changed to make it pass.

## Issue-to-evidence map

| Requirement | Evidence and exact boundary | Remaining condition |
| --- | --- | --- |
| #155 402 is not hot-retried | runtime-reliability.test.ts: one real HTTP402, failed work with no result, one system notice, replay adds no message, then next turn succeeds. Rerun here. Shared client llm-recovery.test.ts and upstream model.test.ts additionally exercise credential-scoped open/half-open circuits. | A live supplier rejection is not induced; this is intentionally isolated fault injection. |
| #155 429/503/network/half-stream/empty | New runtime-provider-fault-matrix.test.ts covers the full product ledger and continuation path described above. | No paid fault matrix or alternative supplier route is claimed. |
| #155 no first byte / total timeout | runtime-provider-timeout.test.ts starts the actual product worker configuration against an HTTP server that never responds:3 requests,3 disconnected transports,3 failed ledger rows, model_unavailable and1 notice. runtime-deadline-recovery.test.ts gives the outer deadline100ms:1 request, disconnected transport, settled call, classified notice and successful next turn. Both rerun here. | Dedicated first-byte-vs-idle timing semantics are upstream model.test.ts coverage; the product no-response test's shorter request timeout wins. |
| #155 caller cancellation | native-admission.test.ts aborts an in-flight model and releases its slot; runtime-reliability.test.ts verifies a queued cancellation creates no extra model calls. Both rerun here. | No cancellation of an actual paid request is needed or claimed. |
| #155 fallback available/unavailable | Upstream model-fallback.test.ts covers same logical budget, current authorization, matching prices/capabilities, missing fallback, cancellation and protocol rejection. Product runtime.ts currently configures a single provider. | No preapproved production fallback route exists in this task. Enabling a route is not an acceptance workaround. Actual fallback route qualification remains conditional on approved configuration. |
| #155 optional memory / embedding | runtime-reliability.test.ts distinguishes optional scope outage from strict implementation/auth failure and is rerun here. Shared llm-recovery.test.ts preserves the embedding model; upstream embeddings.test.ts tests402/429 quota circuits, corrupt vectors and sanitized errors. | Optional scope outage is not the same as an end-to-end live material-dependent retrieval failure. Existing tests cannot prove correct source-dependent browser answers during a real indexing/provider outage. |
| #157 token/cost/deadline/concurrent admission | Upstream child-budget-admission.test.ts covers startup/closing holds, all dimensions, graph rollback, maximum8 pending and settled cost idempotency. Upstream scripts/test-postgres-stores.mjs races8 admissions and requires exactly2 admissions while preserving closing capacity. | These upstream checks are retained3.5.2 release-gate evidence, not rerun from a possibly changing upstream worktree here. Requalify exact next published version. |
| #157 result retention / one notice / new turn | Existing runtime browser fanout fixture verifies two denied starts, no child work, retained successful root answer, one notice and next successful turn. This run repeats group-mentions.test.ts's A→B→C→A chain and five-specialist introduction, plus native admission/cancel/replay. | Browser fanout uses model-call budget, not a real invoice or tiny real-cost cap. Separate parent-held controlled-usage receipt addresses the cost boundary, not full multi-agent live billing. |
| #157 old8/32 ceiling | Public product conversation policy and upstream collaboration tests retain configured8/32 and separately reject mention_limit with a reduced test ceiling. | This run does not exhaust32 live child calls. No need to burn paid tokens to test the ceiling. |
| #161 durable terminal / revocation / partials | Product runtime-reliability tests one persisted notice, no fabricated successful result, cancellation and revoked project causing one failed delivery attempt with no protected message; all rerun. New stream/empty fixtures add result-null and next-turn checks. | Product worker process crash immediately after an actual native business write is still not covered by this new harness. |
| #161 IM accepts then ACK lost | native-admission rerun counts1 actual send,1 durable row, authoritative history recovery and0 additional sends on replay. Existing dedicated real-WuKong runtime recovery retained20/20 and stable result/message identity with unchanged model/action accounting. | This run uses recording WuKong HTTP; it does not relabel the historical real-WuKong receipt as a current rerun. |
| #161 control/worker recovery | Existing upstream separate-process test kills a worker after committed result/artifact and during a graph; stale lease and replay protection are release-gated. Full-SPA evidence stops Web and pauses its independent DB. | A complete product-worker crash-after-native-write fixture with product authorization, shared ledger and final IM/browser readback remains required; existing upstream crash and product Web-restart tests are different boundaries. |
| #161 browser reconnect / session / next send | [3.5.2 runtime browser evidence](../runtime-development/README.md):11/11; [actual SPA evidence](../spa-3.5.2/README.md):6/6 post-login/session/network-before-accept/Web-restart/DB-pause cases, with counts/videos/screenshots. | Browser suites were reviewed, not rerun in this PR. They use synthetic model or human sends, not a complete live-provider full-SPA conversation. |
| #155/#161 real-provider regression | Parent reported the separate exact GLM5.3-Flash files.list→answer,96 previews/persistent replay/JSON helper and4 ledger calls, with two preceding timeout attempts retained. | That PR and exact source/version/evidence must be accepted separately; this PR does not claim to have executed it or close its failed attempts. |

The documented browser matrix is sufficient for its deterministic component/post-login message-recovery scope. Together with this product HTTP matrix it covers the listed transport failure classes without relying only on driver tests. It is **not sufficient for whole-issue closure**: full product-worker crash-after-native-write, complete live-provider SPA continuation, a qualified production-isolation environment and final exact-version qualification remain distinct requirements. Supplier actual debit evidence is also unavailable; usage-priced cost must stay labelled estimated. Keep#153/#155/#157/#161 open until their respective full evidence is accepted.

## Repeatable local commands

Use existing disposable services onPG55432/Redis56379 and installed Node22 dependencies. This launcher intentionally creates its own new database rather than running e2e/server/run.mjs, which hardcodes and resets the shared lingxiloop_integration_test database. No service is paused or restarted.

```sh
node scripts/runtime-acceptance/provider-fault-matrix.mjs
# Only the newly added five scenarios:
node scripts/runtime-acceptance/provider-fault-matrix.mjs runtime-provider-fault-matrix.test.ts
npm run server:typecheck
node node_modules/@biomejs/biome/bin/biome lint server/src/__integration__/runtime-provider-fault-matrix.test.ts
```

The launcher allows only ordinary process paths into its child environment, supplies loopback/synthetic provider settings, uses Redis DB12, migrates a newly created database and requires pass>0, fail=0, skipped=0, cancelled=0. It never loads provider credentials. Re-run this exact selection after installing the final published3.5.3 dependency; do not infer3.5.3 results from this3.5.2 receipt.

Existing official browser rerun, when the local pinned WuKong/fixture services are available:

```sh
E2E_RUNTIME_RELIABILITY=1 E2E_CONNECTION_RECOVERY=1 E2E_BASE_URL=http://127.0.0.1:5196 \
E2E_RECOVERY_EVIDENCE_DIR=.e2e/provider-matrix-browser/counts \
PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright \
npm run test:e2e:web -- e2e/web/runtime-reliability.e2e.ts e2e/web/connection-recovery.e2e.ts \
  --grep 'Durable runtime failure recovery|rapid identity|rapid logout' --output .e2e/provider-matrix-browser --video on
```

Start the existing connection-recovery server with E2E_RUNTIME_RELIABILITY=1 (it creates a new database), but give its isolated copy a dedicated Redis DB rather than its hardcoded0; use an isolated pinned WuKong instance and a Vite fixture proxy to5199. Full-SPA recovery uses the separate5280/55433/56380 acceptance profile described in the linked SPA README. Do not invoke shared-container fault injection in parallel with other acceptance work.

The currently available product-worker isolation preflight was actually retried without privilege changes:

```sh
bwrap --die-with-parent --unshare-all --new-session --ro-bind / / --proc /proc --dev /dev -- /usr/bin/true
```

It exited1: `bwrap: setting up uid map: Read-only file system`. The complete production-isolated Worker action is **blocked by the executor's namespace/filesystem capability**, not denied by approval review. No production Worker was started, no security configuration changed, and no operation is pending. A future qualified existing executor can run the product's ordinary Worker and the missing crash-after-action/full-SPA fixtures; the repository currently has no single product command implementing that entire combined acceptance, so none is invented here.
