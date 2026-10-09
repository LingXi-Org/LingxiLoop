# Issue #111: OpenUI integration decision and M0 evidence

Date: 2026-10-09. Decision: use the pinned `@openuidev/react-lang@0.3.2` public `Renderer` inside the existing native `generative-ui` message surface. Keep the product's external-store runtime, authorized state/action API, native replay and shared component catalog.

## Compared integrations

The official package evaluated was `@openuidev/assistant-ui@0.1.2` (MIT), with `@openuidev/react-ui@0.17.0` and `@openuidev/react-headless@0.17.0`. Its [published package metadata](https://www.npmjs.com/package/@openuidev/assistant-ui/v/0.1.2) and [official integration README at the inspected source revision](https://github.com/thesysdev/openui/blob/c4c0c90575facf824d3d8a64daa11947acc8a668/packages/assistant-ui/README.md) describe Tool UI integration through `present_openui` and `prompt_openui`. The source revision is a documentation reference; the npm tarball's integrity in `published-adapter.json` identifies the actual tested package.

`e2e/interactive-m0.mjs` attempts ordinary npm dependency resolution in two disposable prefixes. It never changes the application's dependency tree or uses `--force` / `--legacy-peer-deps`.

| Check | Result |
| --- | --- |
| Current stack: React/React DOM 19.2.8, Zod 4.4.3, Zustand 5.0.15, assistant-ui 0.15.16, react-lang 0.3.2 | Installation rejected: adapter requires Zustand `^4.5.5`. |
| Same stack with Zustand 4.5.7 in an isolated prefix | Installation succeeds. This downgrade is confined to the experiment. |
| Official `createOpenUIPresent`, custom shared library, current `useExternalStoreRuntime` | Renders correctly; slider updates 45→46 through keyboard input. |
| Direct `Renderer`, same source and controls | Renders correctly; slider updates 45→46 and delivers the custom learning action. |
| Official present adapter, same custom action | Does not forward the custom `interaction` action; no assistant-ui append occurs. Its built-in continuation/tool-result policy requires additional integration with our authorized action protocol. |
| Product theme in light/dark, adapter theme provider disabled | Matching computed foreground/background/font; both screenshots inspected. |
| Production build | No development OpenUI Inspect button. `publishObservability={false}` is explicit on both renderers. |

The adapter works with external-store rendering in the isolated compatible experiment. Vite deduplicates the assistant-ui runtime to the application's installed versions; the disposable prefix's separately resolved transitive versions are recorded in `dependencies.json`. Fixture typechecking uses TypeScript aliases matching that same runtime deduplication. The dependency conflict alone is not evidence of a runtime incompatibility. Direct integration is chosen because it preserves the existing native message protocol and action authorization without downgrading Zustand or introducing Tool UI continuation semantics for persistent interactive lessons. Both paths use the same `interactiveLibrary`, generated from the server-shared catalog; there is no second hand-maintained component vocabulary.

The final fixture's adapter entry contains 1,964,664 bytes of JavaScript and references 294,079 bytes of OpenUI CSS, alongside shared assets including an 858,664-byte library chunk. These are uncompressed assets of a multi-entry comparison that also contains direct and native-message controls. They are not an estimate of incremental product-route cost. `build-assets.json` records exact initial HTML references and SHA-256 hashes; dynamic imports are excluded.

## Frozen performance gates

The production fixture baseline was recorded at **2026-10-09T04:36:22.600Z**, before the final independent run at **2026-10-09T05:04:27.942Z**. The policy was fixed before independent acceptance: three times the baseline, with floors of 100 ms for interaction p95 and 2,000 ms for ready time. The gate file was not adjusted after seeing independent results.

| Measurement | Baseline | Frozen maximum | Independent acceptance |
| --- | ---: | ---: | ---: |
| Interaction p95 | 30.0 ms | 100 ms | 22.9 ms |
| Lesson ready | 322.1 ms | 2,000 ms | 1,138.1 ms (slowest of 20) |

Baseline: one mixed lesson, 30 alternating keyboard updates. Independent acceptance: 20 lessons, 360 px dark layout, 24 keyboard updates followed by 12 continuous pointer moves. `lingxiloop.ui.interaction` measures a valid local state update through the next animation frame; it excludes persistence and does not claim to measure network or model latency. Ready measures mount through personal-state restoration, using the fixture API. Samples are content-free and bounded. Timing values are evidence from this machine, not guarantees for slower devices.

## Repeatable acceptance and artifacts

All page interaction and assertions use `tester-army/e2e`'s official `@e2e-dev/web` engine. The component fixture supplies synthetic API responses and does not establish server authorization or live-model correctness; those have separate live acceptance.

Completed component checks: **nine production-fixture tests** for continuous controls, persistence/reload, mixed composition, light/dark 390 px layout, preview/pending/stale read-only behavior, invalid-source fallback, all five scientific displays, local predictions, duplicate submission suppression, same-request retry, and conflicting-save recovery. Three regression tests were observed failing before their fixes, then passed: an aborted action remains retryable after state reload without losing its idempotency identity; an unconfirmed newer result does not prematurely disable the committed revision; and an offscreen simulation terminates its worker and cannot show old results for new parameters. The official adapter comparison, independent performance test, and reduced-motion/touch-pointer test also pass. With reduced motion active, the computed transition duration is 0.01 ms; the touch-pointer sequence changes the angle to 68° while action requests remain zero.

Real-model generation, teaching review and the natural-language revision scenario remain unverified in this run because the configured model provider returned HTTP 402 for insufficient balance. Their test source is present in `e2e/web/interactive-ui-live.e2e.ts`; the component results above do not substitute for those checks.

Primary artifacts under `artifacts/interactive-ui/`:

- `browser/report.json`, `browser/summary.md`, and named screenshots: nine component checks.
- `m0/dependencies.json`, `m0/published-adapter.json`, and installation logs: dependency and license evidence.
- `m0/build-assets.json`: production fixture asset identities.
- `m0/performance-gates.json`, `m0/independent-performance.json`, and the corresponding `*-browser/report.json`: baseline and independent run.
- `m0/adapter-browser/report.json`, `m0/adapter-theme-{light,dark}.json`, and two screenshots: runtime, actions and theme comparison.
- `m0/motion-browser/report.json`, `m0/motion.json`, and screenshot: passing native reduced-motion media query and synthetic touch-pointer evidence. This is desktop Chromium emulation, not physical touch hardware coverage.

From the repository root, using PowerShell:

```powershell
node e2e/interactive-m0.mjs
npm view @openuidev/assistant-ui@0.1.2 name version license dist.integrity repository peerDependencies --json |
  Set-Content -Encoding utf8 artifacts/interactive-ui/m0/published-adapter.json
npx vite build --config e2e/vite.interactive.config.ts --mode interactive-test
node e2e/interactive-m0.mjs --build-evidence
npx vite preview --config e2e/vite.interactive.config.ts --mode interactive-test
```

Keep preview running, then in another terminal:

```powershell
$env:E2E_INTERACTIVE_FIXTURE='1'
$env:E2E_BASE_URL='http://127.0.0.1:5190'
$env:E2E_BUILD_INDEX='.e2e/interactive-site/e2e/interactive-ui.html'
npm run test:e2e:web -- e2e/web/interactive-ui.e2e.ts --grep 'continuous controls|draft, pending|all scientific|duplicate clicks|conflicting save|reloading after|unconfirmed newer|offscreen simulation' --output artifacts/interactive-ui/browser
$env:E2E_INTERACTIVE_ADAPTER='1'
npm run test:e2e:web -- e2e/web/interactive-ui.e2e.ts --grep 'official adapter' --output artifacts/interactive-ui/m0/adapter-browser
$env:E2E_INTERACTIVE_ACCEPTANCE='1'
npm run test:e2e:web -- e2e/web/interactive-ui.e2e.ts --grep 'independent long-list' --output artifacts/interactive-ui/m0/independent-browser
```

For a **new baseline cycle**, preserve the current evidence first, then run the following **before** any independent result is examined. Do not overwrite a frozen gate merely because acceptance failed:

```powershell
$env:E2E_INTERACTIVE_BASELINE='1'
npm run test:e2e:web -- e2e/web/interactive-ui.e2e.ts --grep 'M0 baseline' --output artifacts/interactive-ui/m0/baseline-browser
```

The optional motion run needs a dedicated local Chromium/Chrome process with a fresh profile and remote-debugging port, then:

```powershell
$env:E2E_CDP_URL='http://127.0.0.1:9335'
$env:E2E_INTERACTIVE_MOTION='1'
npm run test:e2e:web -- e2e/web/interactive-ui.e2e.ts --grep 'reduced-motion' --output artifacts/interactive-ui/m0/motion-browser
```

The test uses CDP only to set the native `prefers-reduced-motion` preference: the current engine otherwise overrides the launch preference to `no-preference`. It verifies the actual media query and computed transition duration through the official engine. Touch PointerEvents are dispatched to the element holding native pointer capture, followed by state and zero-action-request assertions. Neither production code nor `window.matchMedia` is patched for this check.

Installer scripts are disabled in the disposable M0 prefixes; telemetry is disabled for installation and E2E. The application does not load the adapter, its stock component catalog, or its stylesheet. Its renderer receives only the allowlisted learning library and no tool provider.
