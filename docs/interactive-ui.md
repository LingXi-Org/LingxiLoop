# Native learning UI (#111)

## Failure inventory (written before implementation)

- Generation: an unfinished fence or DSL is accepted as final; text examples become executable UI; invalid statements, unresolved references or unsupported versions erase the entire message; citations move when UI source is removed.
- Computation: non-finite inputs, unit mistakes, unbounded samples, DCT normalization errors, missed polynomial tangencies, invalid host door choices or non-reproducible simulations produce plausible but incorrect results.
- Interaction: every drag sends a model request; initial hydration overwrites a saved state; late writes overwrite a revision; navigation leaks another user's state; replay fires an action.
- Authorization: a client forges an action, message/hash, continuation or student identity; a generic IM send bypasses the UI endpoint; a revoked user or superseded card keeps writing; UI scores bypass learning evidence or teacher approval.
- Publication: concurrent revisions share a base; IM accepts a message but its ACK is lost; a crash between IM and PostgreSQL activates two revisions; a duplicate click produces another user message or model run.
- Presentation: streaming props crash chat; keyboard/touch controls fail; graphs lack text equivalents; narrow screens clip actions; hidden experiments retain expensive work.
- Verification: offline fixtures are reported as live-model evidence; skipped tests count as passed; metrics contain prompts/answers; thresholds are chosen after seeing acceptance results.

## Decisions

OpenUI is the parser, renderer and local state engine. LingxiLoop owns its strict component catalog, native message envelope, authorization, persistence and bounded scientific kernels. The existing assistant-ui external store and published LingxiOS runtime retain conversation ownership. Only OpenUI source is persisted; parsed trees are disposable.

Production uses the direct Renderer. The official assistant-ui adapter is compared in an isolated compatibility fixture; it is not a second production chat runtime. All UI actions pass through the existing authorized IM/agent and learning services.

## Evidence and traceability

This document records Issue #111's M0/M1/M2 implementation and the evidence available on 2026-10-09. An unexecuted, skipped, failed, or unmetered case is not a pass. Synthetic task checks do not demonstrate real student learning gains. The live-model run remains pending until both `live/results.json` and `live/run-metadata.json` report success and the real-browser report exists.

### ADR: upstream facts and project decisions

| Basis | Verified fact or project decision | Source |
| --- | --- | --- |
| Upstream fact | OpenUI Lang supplies component registration, generated prompts, parsing, streamed rendering, local state, and action callbacks. These are actual dependencies, not a copied parser or a replacement chat runtime. | Installed `@openuidev/lang-core@0.3.2` and `@openuidev/react-lang@0.3.2` README, exported types and implementation; [upstream repository](https://github.com/thesysdev/openui) |
| Upstream fact | Lang Core's published package documents installation telemetry, opt-in server runtime telemetry, and the `OPENUI_TELEMETRY_DISABLED` / `DO_NOT_TRACK` opt-outs. | Installed Lang Core README, “Telemetry” |
| Upstream fact | The official adapter 0.1.2 declares Zustand `^4.5.5`; this product resolves Zustand 5.0.15. | [Published adapter metadata](../artifacts/interactive-ui/m0/published-adapter.json) |
| Measured project result | Installing the isolated adapter against Zustand 5 fails peer resolution; the same fixture with Zustand 4.5.7 installs. The direct Renderer and the compatible adapter fixture render keyboard-operated controls in the existing external-store runtime and use the product's light/dark colors. The stock adapter does not deliver the catalog's custom learning action. | [Dependency comparison](../artifacts/interactive-ui/m0/dependencies.json), [adapter browser report](../artifacts/interactive-ui/m0/adapter-browser/summary.md), `adapter-theme-{light,dark}.json` |
| Project decision | Use the direct Renderer with the existing assistant-ui external-store runtime. Keep the adapter in a disposable M0 fixture; do not downgrade product Zustand or introduce a second production runtime. | `e2e/interactive-adapter.tsx`, `src/features/chat/components/interactive-ui/OpenUiLesson.tsx` |
| External reference | The referenced OpenAI article describes composed native interfaces, learning by changing inputs, and step-by-step exploration; its examples include CLT and Monty Hall. It does not establish this project's correctness, latency, or learning outcomes. | [Official learning examples](https://openai.com/index/gpt-6-for-everyone/) |
| Project inference | A small shared catalog plus bounded scientific kernels can support these learning tasks without model-generated executable code. Whether a particular model composes and explains them correctly is checked separately against reference facts and transfer questions. | `src/lib/interactive-ui/catalog.ts`, `e2e/interactive-ui-cases.ts`, current-product live integration |

### Versions, licenses and telemetry

The following versions and licenses were read from the installed package manifests and the checked-in lockfiles. Production dependencies added by this feature are exact pins; the adapter is fixture-only.

| Package | Version | License | Use |
| --- | --- | --- | --- |
| `@openuidev/lang-core` | 0.3.2 | MIT | Shared catalog, generated prompt, parser, evaluation and state validation |
| `@openuidev/react-lang` | 0.3.2 | MIT | Renderer, state fields and action events |
| `fft.js` | 4.0.4 | MIT | FFT primitive used by the orthonormal two-dimensional DCT |
| `mdast-util-from-markdown` | 2.0.3 | MIT | Identify only root-level, exact-language fenced blocks |
| `@openuidev/assistant-ui` | 0.1.2 | MIT | Isolated official-adapter compatibility comparison |
| `@lyyzka/lingxios` | 3.3.6 | MIT | Unchanged published runtime and control-plane contracts |
| `@assistant-ui/react` | 0.15.16 resolved | MIT | Existing external-store conversation runtime |
| `recharts` | 3.8.0 resolved | MIT | Existing charting dependency reused for scientific displays |

CI and both Docker dependency-install stages set `OPENUI_TELEMETRY_DISABLED=1`. The isolated M0 install disables lifecycle scripts and sets both opt-outs. Set `OPENUI_TELEMETRY_DISABLED=1` before a manual local `npm ci` as well. The production Renderer passes `publishObservability={false}`; it has no `toolProvider`, cloud configuration, hosted repair integration, or Inspect UI. Low-level parser use does not opt into the package's server runtime telemetry. The shared LLM ledger remains the product's model-usage authority.

The isolated production comparison's initial HTML-referenced assets total 1,376,000 uncompressed bytes for the direct fixture and 3,833,468 for the adapter fixture. These are initial fixture assets, including shared assets, not a measurement of the full product route or dynamic imports. [Asset hashes and measurement scope](../artifacts/interactive-ui/m0/build-assets.json).

### Implementation map

| Contract or behavior | Owning implementation | Verification |
| --- | --- | --- |
| Shared positional catalog, `learning-1` catalog / `openui-0.3.2` renderer versions | `src/lib/interactive-ui/catalog.ts` | Shared source tests and M0 direct/adapter fixture |
| Envelope schema 1, source hash, message/run/revision binding, bounded state and action metadata | `src/lib/interactive-ui/protocol.ts`, `src/lib/nativeMessage.ts` | `server/src/agent-runtime/interactive-ui-projection.test.ts`, UI persistence integration |
| Only exact root-level `lingxiloop-openui-v1` fences; draft/final projection and citation offsets | `src/lib/interactive-ui/source.ts`, `server/src/agent-runtime/interactive-ui-projection.ts`, `message-projection.ts` | Parser/projection tests: incomplete source, examples, unknown components, unresolved references, forbidden expressions and overlapping citations |
| Parser budgets before upstream expansion and strict evaluated props | `src/lib/interactive-ui/source.ts` | Source tests include repeated-reference expansion in both preview and final modes; repeated references count separately |
| Current runtime instructions, source context and durable delivery | `server/src/agent-runtime/context.ts`, `delivery.ts` | Native message/runtime regressions; current-product live integration is a separate gate |
| Local state, delayed merged saves, hydration, readonly previews, scoped failures and explicit actions | `src/features/chat/components/interactive-ui/OpenUiLesson.tsx`, `api.ts`, `context.ts` | Nine offline browser cases, including action reload/retry, state conflicts and pending revision delivery |
| Product controls, safe text, table and steps | `src/features/chat/components/interactive-ui/library.tsx`, `controls.tsx`, `src/components/ui/slider.tsx` | Light/dark, keyboard, narrow-screen, reduced-motion and touch-pointer fixtures |
| Numerical algorithms and bounded sampling | `src/lib/interactive-ui/kernels/` | Thirteen deterministic kernel cases; fixed fixture inputs and seeds |
| Scientific charts, text values and cancellable probability work | `src/features/chat/components/interactive-ui/science.tsx`, `science-worker.ts` | Scientific browser fixture and kernel tests |
| Reservation → confirmed IM receipt → committed revision; personal-state compare-and-save | `server/src/im/interactive-ui.ts`, `interactive-ui-repository.ts` | Pending publication, lost ACK, unknown dispatch, concurrent revisions, stale saves and recovery cases |
| Server-owned action intent/recipients; generic ingress cannot mint a UI action receipt | `server/src/im/interactive-ui-admission.ts`, `messages-application.ts`, `webhook-application.ts`, `server/src/agent-runtime/receive.ts` | Action allowlist/digest tests and real webhook outbox test with `@all` / another agent in data |
| Canonical IM content wins over same-result SSE reconstruction | `src/features/chat/runtime/run-updates.ts` | `run-updates.test.ts` regression for a rejected revision's persisted text fallback |
| Exactly two product tables; no runtime DDL | `server/src/db/migrations/0033_interactive_ui.sql` | `migration.test.ts`: empty database, version-32 upgrade preserving data and repeat no-op |

WuKongIM stores the canonical source in the native message. PostgreSQL stores publication indexes and personal exploration state, not an AST or a second source document. Envelope fields/actions are derived contracts checked again against that source. The revision index binds the native `run-…` message identity to the actual WuKong message ID.

Admission limits include 32,768 UTF-8 source bytes, depth 16, 128 statements, 4,096 significant/expanded tokens, 512 materialized components, 32 fields, 8,192 state bytes and 16 actions, with at most four lessons per message. Kernels independently cap each plotted curve at 1,001 samples, a plot at four curves, CLT at 1,000,000 draws, Monty Hall at 100,000 trials and DCT at 16×16. Invalid or non-finite inputs fail explicitly. The accepted language excludes arbitrary HTML/JS, `eval`, member access, queries, mutations, general expressions and external resource actions; the Text renderer uses a small Markdown element allowlist.

### Seven required learning scenarios

The same components can be composed together; these are task inputs and correctness criteria, not seven fixed product pages. The current-product live definitions are in `e2e/interactive-ui-cases.ts`.

| Scenario | Components and independent computation | Required concept / transfer check | Evidence boundary |
| --- | --- | --- | --- |
| Projectile | `Parameter`, `Prediction`, `ProjectilePlot`, action; SI-unit trajectory/range/time/height kernel | No drag and equal launch/landing height; 45° maximizes range; doubling speed quadruples range | Kernel and offline browser checks passed; real-model angle/speed/gravity composition pending |
| Functions | Bound coefficients, `FunctionPlot`, analytic polynomial intersections | Linear/quadratic comparison; `x²=x` gives `(0,0),(1,1)`; transfer `x²=2x` gives `(0,0),(2,4)` | Kernel covers tangency, identical/no/off-domain intersections; live generated composition pending |
| DCT | Fixed 8×8 or 16×16 grayscale input, coefficient count, reconstruction and numerical error | All coefficients reconstruct within `1e-9`; retaining more zigzag coefficients cannot increase MSE; truncation is lossy | Both fixture sizes and truncation invariant checked; generated explanation/transfer pending |
| CLT | Distribution choice, sample size, seeded mean-distribution histogram | Distinguish sample means from raw data; finite-variance IID assumption; n=25→100 halves standard error | Seeded moments/count conservation and bounds checked; model teaching task pending |
| Monty Hall | Prediction, chosen door, reveal/switch controls and seeded repeated simulation | Host knows the prize and opens an unchosen losing door; stay 1/3 versus switch 2/3; random-host rule needs separate conditioning | Host-rule and simulation kernel checks passed; composed model task pending |
| Concept comparison | `Layout`, `Table`, `Text`, prediction and explicit check action | TCP reliability does not imply TLS confidentiality; correct the “complete arrival prevents eavesdropping” misconception | Mixed table/prediction browser fixture passed; real correction and independent grading pending |
| Step explanation | `Steps`, prediction, text, graph where useful and check action | `2x→2x+3` shifts vertically while slope stays 2; unseen `5x−1` at x=2 is 9 | Step navigation and local input checked; generated feedback/transfer pending |

The independent numerical implementation measured full-DCT reconstruction errors of approximately `2.22e-16` (8×8) and `3.33e-16` (16×16), below the fixed `1e-9` test gate. At seed 42 over 100,000 standard Monty Hall trials, stay/switch counts were 33,424 / 66,576. These deterministic checks establish implementation behavior, not a claim that each random trial follows its theoretical proportion.

The live suite also defines an untemplated mixed linear/quadratic task, a one-sentence text-only task and an unsupported arbitrary-PDE/network-tool task. Successful live evidence must show that mixed composition works, that text remains text when requested, and that unsupported capabilities are explained without fabricated execution.

### Authorization and delivery boundaries

An action request accepts only the message/UI reference, revision/hash, allowlisted action ID, idempotency key and bounded state. It cannot provide the acting user, agent, project, tool name, grade or approval decision. The service reads the committed source through authorized IM history and constructs one of three fixed intents: explain, check prediction, or submit answer for feedback.

The same transaction-scoped UI lock serializes revision reservation, state updates and new action admission. A deterministic nonce and the existing acceptance digest bind all admitted content. Replays return the recorded acceptance; changed content with the same key conflicts. A dispatch marker is persisted before sending. An unknown ACK is reconciled by immutable nonce against IM; absence is not treated as permission to resend or expire a pending revision.

The UI endpoint, generic user-message acceptance, committed webhook and agent receive path check the receipt and current scope. Data text cannot create new agent recipients: after admission, `uiInteraction` routing uses only the server-minted mention list. Current waiting input must match the original principal and current `requestVersion`; a historical request-version snapshot starts a new human turn. Failed/cancelled runs reject new actions, while confirmed receipt replay retains its original identity.

`submit-answer` creates a human learning message; it does not directly insert a formal assessment or approve a teacher operation. Those effects remain under existing learning tools, `resolveTeacherScope`, teacher approval requirements/freshness checks and the native approval endpoint. UI tests reject an attempted `teacher.review_evaluation` action. The owning `teacher-agent.test.ts`, `native-message-approvals.test.ts` and `learning-foundation.test.ts` regressions passed together with the nine UI persistence cases; the separate authorization report records all 26 successful cases.

### Observed verification and remaining gates

| Evidence | Recorded outcome | Limit |
| --- | --- | --- |
| [Final command checks](../artifacts/interactive-ui/verification.json), [core checks](../artifacts/interactive-ui/core-checks.log), [Web build](../artifacts/interactive-ui/web-build.log) | Core contracts/numerics 27/27, run-update regressions 16/16, selector checks 2/2; scoped lint, Web/server/E2E typechecks and Web build passed | Owning checks only; no full repository suite. Build retains existing CSS/import/chunk warnings. |
| [Offline browser report](../artifacts/interactive-ui/browser/summary.md) | 9 passed, 0 failed | Isolated production component fixture; no real provider or production authentication |
| [Persistence report](../artifacts/interactive-ui/persistence.json) | 9/9 checks passed, including data-mention recipient restriction and actual STUDENT / registered teacher-room / foreign-tenant / second-conversation scopes | Real PostgreSQL and recording WuKong HTTP; separate from live-provider and formal-teacher approval regressions |
| [Authorization regressions](../artifacts/interactive-ui/authorization-regressions.json) and sibling log | 26/26 passed across UI persistence, teacher-agent, native approval and learning-foundation suites | Covers the existing formal-learning and teacher approval boundaries; no real model provider |
| [Real-WuKong transport](../artifacts/interactive-ui/wukong/results.json), [browser checks](../artifacts/interactive-ui/wukong/browser-checks.json) and [browser report](../artifacts/interactive-ui/wukong/browser/summary.md) | Integration 1/1 and browser 1/1 passed: two lost ACKs reconciled without resend; angle 40 persisted through two reloads; local action delta 0; double click added one durable action/message | Actual PostgreSQL, pinned WuKong and product state/action APIs with isolated authentication; deterministic source, no model worker or provider |
| [Server regression report](../artifacts/interactive-ui/server-regressions.json) and sibling log | 30/30 passed across the initial UI persistence suite, migration, native-message flow and nonthinking regressions | Predates the new recipient/student-room cases; uses a recording WuKong HTTP fixture and does not establish live-model results |
| [M0 baseline](../artifacts/interactive-ui/m0/performance-gates.json) | 30 alternating keyboard changes: interaction p95 30 ms, ready 322.1 ms; gates frozen at 100 ms / 2,000 ms | Measured 04:36:22 UTC before independent acceptance |
| [Independent performance](../artifacts/interactive-ui/m0/independent-performance.json) | 20 mixed lessons at 360 px: interaction p95 22.9 ms, maximum ready 1,138.1 ms; frozen gates passed | Fixture latency excludes generation/provider time |
| [Adapter comparison](../artifacts/interactive-ui/m0/adapter-browser/summary.md) | 1 passed, light/dark comparison and direct-action behavior recorded | Adapter uses isolated compatible Zustand 4 |
| [Motion report](../artifacts/interactive-ui/m0/motion.json) and [browser result](../artifacts/interactive-ui/m0/motion-browser/summary.md) | Native reduced-motion media applied, transition `1e-05s`, touch-pointer path changed angle to 68 with 0 action requests | Synthetic touch PointerEvents under native pointer capture; not physical-device or screen-reader testing |
| [Live run metadata](../artifacts/interactive-ui/live/run-metadata.json) and [provider blocker](../artifacts/interactive-ui/live/provider-blocker.json) | Blocked: candidate returned HTTP 402; the separately configured product key also returned 402 / code 30001. No generation usage was measured. | Requires funded/working local candidate and judge credentials, then a complete real-model run. This is not a pass. |

Accessible labels, figure summaries, visible focus, keyboard changes, synthetic touch, reduced-motion CSS, 360/390-pixel widths, both themes and a 20-lesson list have targeted coverage. This is not an audit with an actual screen reader or physical touch hardware.

The review regressions cover repeated-reference expansion before materialization, changed polynomial coefficient bindings or prediction questions requiring a state reset, UI data mentions accidentally waking other agents, and stale SSE replacing the canonical fallback. The browser regressions also cover an in-flight action during state reload, obsolete Worker results, and an unconfirmed new revision disabling the committed card. Revision editing tasks still need the live evidence for added/removed controls, comparison changes, corrected units/assumptions, compatible retained state and incompatible reset. The live report must also contain first useful preview, readiness, measured call counts, failure/recovery outcomes, misconception correction and unseen transfer grading. Missing usage or a failed judge cannot be converted into success.

### Repeatable entry points

Use repository scripts and dedicated test databases only. Integration reset helpers refuse unsafe database names. No command here targets production.

```sh
# Core numerical and shared-source contracts
node --import tsx --test src/lib/interactive-ui/kernels/kernels.test.ts src/lib/interactive-ui/source.test.ts server/src/agent-runtime/interactive-ui-projection.test.ts

# PostgreSQL-backed owning regressions, including migration upgrade/no-op
node e2e/server/run.mjs --file interactive-ui.test.ts --file migration.test.ts --file native-message-flow.test.ts --file runtime-nonthinking.test.ts

# Existing formal-learning and approval boundaries (separate regression gate)
node e2e/server/run.mjs --file teacher-agent.test.ts --file native-message-approvals.test.ts --file learning-foundation.test.ts

# Real WuKong ACK recovery plus real-API browser persistence and action checks
node e2e/server/interactive-ui-live.mjs --live-generative-ui --transport-only

# Disposable official-adapter dependency comparison
node e2e/interactive-m0.mjs

# Explicit metered current-product live acceptance
node e2e/server/interactive-ui-live.mjs --live-generative-ui
```

Offline browser reproduction uses `e2e/vite.interactive.config.ts` to build/serve the isolated production fixture, `E2E_INTERACTIVE_FIXTURE=1`, and `E2E_BASE_URL` pointing to that server. Each browser artifact directory contains its exact `run-metadata.json` command plus JSON/JUnit reports and screenshots. The separate M0 passes opt in with `E2E_INTERACTIVE_BASELINE`, `E2E_INTERACTIVE_ACCEPTANCE`, `E2E_INTERACTIVE_ADAPTER`, or `E2E_INTERACTIVE_MOTION`; the motion pass also uses an isolated `E2E_CDP_URL` through the official engine. Reusing frozen gates never rewrites them after seeing acceptance results.

The live entry requires the configured candidate/judge credentials, explicit opt-in, synthetic identity, single model concurrency, a dedicated `lingxiloop_ui_model_test` database, real isolated WuKong, and bounded budgets (USD 0.25/run, USD 5 total). It disables unrelated email, embeddings and notebook activity and fails when credentials or usage are missing. Ordinary offline E2E does not opt into this entry. `eval` results from a separate harness do not satisfy this gate.

The `--transport-only` entry uses the same isolated database and pinned WuKong but does not start a model worker. Its zero-call ledger result confirms this run made no model requests; it cannot establish model generation, feedback or follow-up behavior. The browser still uses the actual product converter, Renderer, GET/PUT state endpoints and POST action endpoint, and verifies durable IM history rather than replacing those responses.

Final release evidence also requires affected lint, web/server/E2E typechecks and the web build. Keep their actual command results alongside the finished reports. This work does not authorize production deployment and does not claim real-student learning gains.
