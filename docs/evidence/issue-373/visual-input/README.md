# #373 input, reading and semantic surfaces

Baseline: `2686f475eac075bc9033f13714d5d6bbfa5078eb`. Changes remain local until the sole integrator reviews and releases them. All browser data is synthetic; no provider, production service or private workspace is used.

## Owning changes

- `composer-composition.ts` protects native IME-owned keys at Lexical's root capture boundary, before both the custom concurrent submit and the installed primitive's mention/slash/cancel handlers. Browser composing flags, legacy 229, Lexical composing state and a same-task composition-end boundary are checked. Native default behavior is allowed. A key release or next task clears the end boundary; no human-scale send delay is introduced. Blur clears abandoned local composition state.
- `ComposerTriggers.tsx` retains official mention/slash primitives, wraps long labels and descriptions, bounds the popover to its container, and exposes visible keyboard focus.
- `ConversationThread.tsx` retains the assistant-ui viewport, message keys, history pagination anchor and explicit return-to-latest path. Selection, disclosure activation and quote navigation pause following before the next content update. Explicit return to latest clears that intent.
- `globals.css` preserves green branding, separates app and card surfaces, strengthens the border and semantic focus ring, and scopes comfortable/compact density tokens. Real consumers are `ConversationThread` and the shared `Table` (caller props can override compact).
- `chat.css` restores visible selected draft text, paints shell focus and uses comfortable reply leading/spacing through the shared density variables. Existing global reduced-motion handling is retained.

## Source mapping and reuse

No `open-claude-ui` code was copied. Its referenced reverse-engineered examples are behavior ideas only because origin remains uncertain. Fixed issue references: [IME/menu](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/RichComposerWithMentions.tsx), [reading intent](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/useClaudeScrollPinning.ts), [theme](https://github.com/Caho1/open-claude-ui/blob/c1f923ae0051a871941b98a0e2e3183a545e6a85/code-examples/cds-theme.css).

Actual primitives are the installed `@assistant-ui/react-lexical@0.2.11` (`LexicalComposerInput.tsx`: high-priority keyboard delegation), `lexical@0.49.0` (`src/LexicalEvents.ts`: composing and browser-end ordering) and `@assistant-ui/react@0.15.16` (`useThreadViewportAutoScroll.ts`: pointer intent, native scroll, resize and bottom following). Existing project `message-presentation.ts`, `NativeMessageContent.tsx`, `ConversationMessage.tsx`, `run-activity.tsx`, converter/store and latency collector remain the source of body/process/attention separation, stable answer identity and real paint instrumentation.

## Checks and reproduction

Node: `/workspace/.tools/node-v22.23.3-linux-x64/bin/node` (22.23.3). Shared dependency symlink was unchanged.

Focused regression failed before the fix: 229, stale composition flags and post-end confirmation reached the downstream key handler. The installed guard passes the same regression, including immediate next Enter and cleanup.

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  src/features/chat/components/composer-composition.test.ts \
  src/features/chat/components/ConversationMessage.test.tsx \
  src/features/chat/components/message-presentation.test.ts \
  src/features/chat/runtime/latency.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p e2e/visual-input/tsconfig.json --noEmit
```

The 23 existing ConversationMessage cases verify retained native v2 messages, one default process disclosure, visible current decisions, legacy compatibility and recovery/terminal behavior. Seven existing presentation cases cover unique interaction ownership, stable answer identity, process/attention separation and ordered events. The existing latency test checks real text eligibility, double-frame timing, coalescing and cancellation on a controlled browser clock. These are unit/component evidence, not a performance benchmark.

Browser verification uses tester-army/e2e 0.17.0 and official `@e2e-dev/web` 0.12.0 over the already installed Chromium. Start a dedicated browser with CDP on 9337 and a disposable profile, then:

```sh
E2E_CDP_URL=http://127.0.0.1:9337 E2E_TELEMETRY_DISABLED=1 \
  node_modules/.bin/e2e run --config e2e.visual-input.config.ts
E2E_VISUAL_BASELINE=1 E2E_CDP_URL=http://127.0.0.1:9337 E2E_TELEMETRY_DISABLED=1 \
  node_modules/.bin/e2e run --config e2e.visual-input.config.ts
```

The dedicated Vite configuration uses a fixed server mode for each run. Baseline files come from `git show` at the fixed commit; baseline chat CSS is inlined so PostCSS cannot accidentally read the modified on-disk import. No upstream script is executed. The fixture uses real ComposerLexicalInput/Triggers, ConversationThread, converter, existing message rendering and latency collector; it supplies synthetic public history and locally stubs only read receipts/run listing. It does not simulate model latency or backend delivery.

Failure history retained: initial external-output configuration rejected by e2e; first cold fixture loaded blank; live before/after module-graph toggling caused intermittent blank navigation, replaced with fixed server modes. Initial `fill` after Shift+Enter retained Lexical paragraph structure, replaced with actual keyboard selection/backspace for menu tests. A focused reading test then found a real 16px native scroll-anchor drift while selected earlier text and viewport height remained constant. The single-variable experiment with `overflow-anchor:none` removed the drift, but was reverted because globally disabling native anchoring risks async image/font growth above the reader. The original values and run IDs are retained in `native-anchor-experiment.json`; final acceptance requires unchanged selected text and displacement smaller than one body line (28px), not pixel identity.

## Remaining acceptance limits

Synthetic DOM CompositionEvents cannot prove a physical Chinese IME or Safari/Firefox/WebKit behavior. Physical supported-browser acceptance remains required. In the observed selected-history append/revision path, native overflow anchoring moved the viewport by 16px (less than the 27.2px body line) without changing or hiding the selected text. Native anchoring is intentionally retained; shrinking an answer at the exact scroll maximum can also clamp the viewport. Async image/font height growth and complete pagination paths need combined acceptance before issue closure. The end guard deliberately covers the same event task and legacy 229, not an arbitrary long debounce.

Synthetic dev first-body/paint samples use the real collector and body DOM, but are small warm local samples with no model/network path; differences are not an optimization claim. Full release CI/build, broader forum/homework/teacher surfaces and combined-state/artifact acceptance belong to the integrator. The #375 ContentEditor/schema/CasesPage chain was not edited. Rollback is the visual-input commit; no schema, protocol or durable state changes are involved.

## Final observed after result

Official-engine run `01a16c63-4032-7386-a021-6b7ce07771a4`: 1/1 synthetic browser scenario passed in 14.99s (18.23s total, Vite startup 839ms). Linux Chrome153.0.8010.12 over CDP9337, Node22.23.3. Native 229 is blocked, same-task composition-end confirmation is blocked, next Enter submits, Shift+Enter keeps input, @ and / retain their menus during 229 and respond to normal Enter/Escape. The same real body DOM node survives streaming and completion. Earlier selected text remains unchanged after answer revision/append; native anchoring displacement is 16px, retained in the raw evidence. At 390px in dark theme scrollWidth is390px. Focus is a2px semantic green outline, selection is nontransparent. Native reduced-motion preference reports true and the existing entrance animation reports `none`.

The real ConversationMessage body and latency collector recorded first_body_visible110.9ms and receiveToPaintP95Ms110.5ms across2 paint samples. This is a warm synthetic dev-path observation, not a model/network metric or a performance improvement claim.

Static canonical-token luminance calculations (sRGB gamut-clipped) give body/secondary text contrast18.90/7.15 in light and16.98/6.74 in dark; primary action text4.72/6.71 respectively. These calculations cover canonical opaque token pairs, not every translucent or nested component state.

Fixed baseline companion run `01a16c64-61e4-73f3-8cd1-8217f8071a6e` passed1/1 in12.76s (15.33s total). It reproduced229 submitting once and retained body DOM identity. Baseline body leading24px→after27.2px; table row padding12px→8px; page/card white-white→subtle app/white card. Baseline first_body_visible152.0ms and receiveToPaintP95Ms151.3ms across1 sample. Before/after raw observations and selected screenshots are retained beside this document. Sample size and different dev scheduling preclude a causal performance conclusion.

Source checks: focused33 tests passed (2 new +23 message +7 presentation +1 collector), focused lint passed6 source files, web `tsc --noEmit` passed. An attempted broader unchanged `run-updates.test.ts` failed during server env initialization (first DATABASE_URL, then WUKONG_USER_TOKEN_SECRET); it was not counted as passed and is outside this isolated UI boundary.

Visual inspection limit: `after-dark-narrow.png` was taken immediately after a same-page theme switch, during the inherited700ms streaming-word color transition. Older text is temporarily dark in this transition snapshot. The subsequent native reduced-motion and focus assertions pass, but this image is not settled dark contrast acceptance; retain it as the historical transition snapshot; the follow-up below supplies the settled dark390px evidence.

Fixture verification: `tsc -p e2e/visual-input/tsconfig.json --noEmit` passes after narrowing the synthetic assistant tail and making official-engine evaluate callback results explicitly JSON-serializable. The first stricter fixture check failed on these typings and an omitted existing DOM declaration; the owning configuration now includes that declaration. These fixture typing/JSON-return corrections followed the passing browser reports; product source and assertions were unchanged, and no additional browser slot was consumed. Focused fixture/config lint also passes4 files.

## Settled dark390px follow-up

Root requested a bounded follow-up of the existing fixture, with no product or
original assertion changes. Official run
`01a16ca3-4687-7e56-83ad-59af73a1a533` passed1/1 in15.75s (17.71s total,
Vite startup752ms) on original source
`14c941eef88c4a85e69a13d2350f859da5980c66`. The capture-only helper used the
existing synthetic stream, switched light→dark, waited850ms after the next
frame, and verified computed colors stayed identical across two further frames.
No IME scenario, provider, full visual suite or product build was rerun.

All213 sampled visible answer-word spans settled to `oklch(0.985 0 0)`
(sRGB250/250/250) on the actual thread background
`oklch(0.141 0.005 285.823)` (sRGB9/9/11). The measured opaque-text contrast
to that background was19.061142529601344:1. At390px the document scrollWidth
was390px; the thread client width was348px. These facts describe this settled
visible answer path, not every control or browser. The prior immediate-switch
image remains retained as transition evidence; the new
`001-settled-dark-390.png` supplies the previously pending settled frame.

`settled-dark-metrics.json`, `settled-dark-browser-report.json` and
`settled-dark-sha256.json` retain the raw facts, actual official runner receipt
and file hashes. The helper and root-level capture config are retained for
reproduction from the repository root:

```sh
E2E_CDP_URL=http://127.0.0.1:9337 E2E_TELEMETRY_DISABLED=1 \
  node_modules/.bin/e2e run --config e2e.settled-dark-capture.config.ts
```

The first configuration was placed beside evidence; the engine treated that
folder as its project root and rejected collection with `NO_TESTS` before any
browser started. Moving only the capture config to the repository root resolved
collection. After the successful run its own Vite5193 listener and generated
cache were gone, and CDP9337 was handed to the377 learning owner.
Physical IME/other engines, asynchronous height changes and pagination remain
separate acceptance boundaries. This follow-up does not establish all eight
areas of #373, server authorization/idempotency or a production release.
