# #335 — assistant-ui native reply quotes

Message and composer quotes now use the installed native quote primitives and official registry styling. After synchronizing the latest main including #333, desktop/390px light/dark browser acceptance passes; web lint, typecheck, build, all 123 web tests, and the quote fixture typecheck pass. No merge or deployment was performed.

Base: `3d0d9f4ffa2f8e865d152180b4e4ee3f7bb9b523` (latest main when fetched, runtime 3.8.2 / native 14 / product 54). No merge or deployment is part of this change.

Final branch was rebased without conflicts onto `ca0ab5a9644e9b9a47a25c048cf52131bae6de5c` after the sole integrator merged #333. Quote product/test content is byte-identical to the initially reviewed candidate; only this evidence summary changed. On that combination, build/typecheck pass (Vite 42.95s), lint passes with the same existing diagnostics, all **123/123** web tests pass, quote fixture typecheck passes, and browser **2/2** passes (run `01a16720-06e6-7040-9487-74ea92d3b4c7`, 37.39s total, `.e2e/issue-335-latest-main/report.json`). Eight fresh internal screenshots are under its `artifacts/web/*/default/attempt-0/screenshots/`; the 390px dark composer was re-inspected. Logs: `/tmp/lingxi-335-latest-{build,test,lint,types,browser}.log`.

## Official implementation evidence

Installed and package-lock resolved versions are `@assistant-ui/react 0.15.16` and `@assistant-ui/core 0.3.15`. Dependencies and lockfile stay unchanged.

- [Official quoting guide](https://www.assistant-ui.com/docs/guides/quoting) describes composer quotes and quote metadata. Reply quotes here are structured metadata, never Markdown blockquotes.
- [Official registry quote.aui.tsx](https://github.com/assistant-ui/assistant-ui/blob/24b84e51911a539b20c9f7000f64c09e6c9f253e/packages/ui/src/components/react/assistant-ui/elements/quote.aui.tsx) defines the styled `QuoteBlock` and `ComposerQuotePreview`. They are copyable registry source, **not** named exports from `@assistant-ui/react`. The integration copies their relevant layout/style classes into the existing owning component. It does not claim a nonexistent `QuotedMessage` or `ReplyMessage` package API.
- [Official visual sample](https://github.com/assistant-ui/assistant-ui/blob/24b84e51911a539b20c9f7000f64c09e6c9f253e/apps/docs/components/pages/docs/samples/quote.tsx) shows the user-bubble quote (quote icon, muted two-line italic excerpt) and composer (muted rounded inset, quote icon and dismiss).
- The installed `react/src/primitives/message.ts` publicly re-exports `MessagePrimitive.Quote`. The installed `core/src/react/primitives/message/MessageQuote.tsx` reads `metadata.custom.quote` and renders its callback. Its Git blob hash `c160f0002ec28600cdbe6df0f6554c1d10eadb47` exactly matches the [official source](https://github.com/assistant-ui/assistant-ui/blob/24b84e51911a539b20c9f7000f64c09e6c9f253e/packages/core/src/react/primitives/message/MessageQuote.tsx).
- Installed `react/src/primitives/composer/ComposerQuote.tsx` provides real `ComposerPrimitive.Quote`, `QuoteText`, and `QuoteDismiss`. `QuoteText` returns null for empty `quote.text`, even with children: attachment-only/unavailable quotes therefore need an explicit text span fallback. The native dismiss still clears composer state.

Local additions preserve the existing author label, accessible jump button/focus ring, `overflow-wrap:anywhere` for unbroken URLs, and 44px cancel target. Author labels sit beside the same native-style icon/excerpt layout. No colored side border or RCE quote background remains. Human quote placement stays inside the current bubble, and agent/media-only placement uses the same shared renderer.

## Scope and invariants

Only `QuotePreview.tsx` and the two legacy quote CSS imports in `globals.css` change product behavior. `ConversationMessage.tsx`, runtime converter/transport/provider, protocol, schemas, dependencies, and authorization remain untouched.

Existing quote ID, history projection, same-conversation source lookup, snapshot/attachment/deleted fallback, jump and serialization are reused. The browser fixture includes a separately cached conversation to assert that unknown target IDs cannot resolve its text. All browser data is synthetic; no production conversation, credentials, or user screenshot is used or uploaded.

## Verification

Failure model was updated before implementation in `e2e/quote-preview/browser.e2e.ts`: stale RCE chrome, lost quote slot/style, missing author/media/unavailable fallback, duplicate quotes across parts, long URL overflow, cancel submitting/losing focus, lost jump activation, reply ID loss or retained quote on the next send, cross-conversation lookup, and dark/mobile style loss.

Browser uses `e2e 0.17.0` and the required official `@e2e-dev/web 0.12.0` engine, attached to disposable loopback Chromium 154 over CDP. No direct Playwright import/run.

```sh
E2E_TELEMETRY_DISABLED=1 E2E_CDP_URL=http://127.0.0.1:53335 npx e2e run --config e2e.quote-preview.config.ts --output .e2e/issue-335-green
npm run lint
npm run typecheck
npm test
npm run build
npx tsc -p e2e/quote-preview/tsconfig.json
npm run test:e2e:typecheck
```

Results (2026-10-23, Node 24.19.0 locally; CI uses repository Node 22):

- Before product edits, both browser cases fail the native-style assertion: old card radius `10px` versus borderless QuoteBlock (`.e2e/issue-335-red-native/report.json`). The first browser startup before reinstalling dependencies had an unrelated missing locked `html-to-image` package; that attempt is not counted as a style regression.
- `npm ci --ignore-scripts --no-audit --no-fund --cache /workspace/.npm-cache` in root and server restores the exact lockfiles. The preinstalled server runtime was stale 3.5.2; both installed copies are now 3.8.2. No package or lockfile edits.
- Browser acceptance: **2/2 pass**, run `01a1671a-b8d2-74ac-903a-f9d522f7cfab`, `.e2e/issue-335-green-final/report.json` (22.86s total). Both widths cover native quote icon/text slots, transparent borderless message excerpt, two-line italic 14px text, author, user/incoming/agent/media/multipart quotes, snapshot/unavailable/empty/tool fallbacks, late text arrival, Enter/Space jump, local conversation isolation, sanitized composer text, attachment-only composer preview, cancel and refocus, preserved send reply IDs, cleared quote and a subsequent unquoted send, reload, dark theme and no horizontal quote/page overflow.
- Eight internal screenshots cover history and composer at 1280px/390px, light/dark. Inspected desktop light and mobile light/dark plus composer screenshots. They show the official quote icon/italic message excerpt and muted composer inset without legacy side bars, quote clipping or horizontal overflow. `rounded-lg` correctly follows this product's 12px semantic radius token. Screenshot paths: `.e2e/issue-335-green-final/artifacts/web/*/default/attempt-0/screenshots/`.
- `npm run lint`: exit 0, 5 existing warnings and 3 existing infos in unchanged files; no quote warnings.
- `npm run build`: exit 0, includes successful web/node typecheck and Vite build (38.87s). Existing CSS `::highlight`, mixed dynamic/static import and chunk-size warnings remain.
- `npm test`: **122/122 pass**, no skips.
- `npx tsc -p e2e/quote-preview/tsconfig.json`: exit 0. Includes the real quote fixture, browser cases, config, and existing ambient DOM declarations.
- Supplemental `npm run test:e2e:typecheck`: exit 2 on unchanged `e2e/forum/api.ts:160` and `server/src/agent-runtime/activity-tool.ts` / `server/src/im/router.ts` OpenAI/Zod type boundaries (root Zod 4.4.3, server 4.5.4). The same errors reproduce from archived unmodified main with the same locked dependency trees. This is an existing whole-suite typecheck failure, not a claim of a passed gate. Runtime/protocol changes are outside this task.
- Read-only PR #333 comparison at head `bf50c72c41280ced0f626a1aa38232d7ca9222f5`: no changed-file overlap. Its UI files are `AssistantMessageActions.tsx`, `ConversationMessage.test.tsx`, and `HarnessDetails.tsx`; this patch does not modify them or `ConversationMessage.tsx`.

Logs stay in `/tmp/lingxi-335-*.log`, including `build-final`, `test-final`, `lint`, `focused-types-final`, `e2e-typecheck-final`, and `main-e2e-types-final`. Screenshots stay in ignored `.e2e/` and are not committed or posted publicly. Final commit review and exact-head CI are recorded on the draft PR; the designated sole publisher owns combined release acceptance.
