# #405 / #409: explicit handoffs and Chinese mention presentation

Owner: this resumed cloud task, explicitly reassigned by the user through parent `01a157da-f40f-77e4-9b9c-cd27028a1033`. Branch: `fix/405-409-explicit-handoff-chinese`. Started from main `a6b54673b6821c8489a654e2966235035844f861`, then merged main `a754a8606293f6ddf0ee96b872c0d3983f1d644b` without conflicts. The user's latest instructions authorize this task's conflict resolution and replace the earlier shared-file pause. No independent review was started, as requested. Production publication remains solely with `01a16484-bef1-7317-8f6e-da46a18450e9`.

## Behavior

- A member list or ordinary mention has no dispatch effect. The shared `conversationHandoffMentions` parser recognizes an explicit unquoted prose line, `协作交接：@中文显示名 具体任务`. Each line has one recipient and non-empty task text. Repair deferral and delivery use that same contract; new preset personas and the Canvas collaboration skill reuse the same current rule rather than instructing bare @id dispatch. Code, quotes, self mentions, humans, unknown/ambiguous names and broadcasts cannot implicitly assign work. Stable-ID mentions remain readable for accepted/history compatibility.
- Delivery still commits the native answer before ingesting assignments. Existing frozen audience, current channel membership, recipient capabilities, policy version, result causality, binding, depth/run budgets and replay idempotency remain in their existing owners. #407 terminal classification/feedback and #408 current-speaker binding are retained; formal 3.8.12 correction replacement and #404 admission coordinates are unchanged.
- `participantDisplayName` remains the single six-preset mapping. Participant loading and WS additions project names for member lists, profiles and accessible labels while retaining the stored name as an internal alias. Built-in aliases survive rename and resolve only in the supplied roster. Human names and all stable IDs are unchanged.
- Markdown displays Chinese names in prose, tables, quoted history and standalone formatted mentions. Partial/unknown English handles show `@未识别成员` without a recipient ID, so no raw English handle flashes during streaming and no fuzzy dispatch occurs. Member-ID table columns display member names; official Streamdown table copy/download uses those DOM cells. Actual program code, URLs and email addresses keep their literal content.
- Whole-message copy sanitizes citations before projecting mention labels; quotes, conversation previews, composer suggestions/chips and TipTap mention display use the same naming contract. Stored messages, source/part identities and reference coordinates are not rewritten for presentation.
- A custom legacy English Agent displays the generic `智能助教` label until its owner explicitly sets a Chinese display name in the existing name setting. That generic fallback is never a name alias for dispatch. The editor and server create/name-update contract require 1–80 Han characters. Unrelated edits to legacy records remain compatible. No translated identities, human renames, ID migration or new database schema are introduced.

## Checks

All checks use synthetic users/messages and local disposable PostgreSQL/Redis with the existing recording WuKong HTTP server. The exact lock installs formal LingxiOS 3.8.12; no credential transfer, alternate identity, provider call or production message was used.

| Check | Result | Evidence |
| --- | --- | --- |
| Targeted mentions, handoff, name contract, participant state, Markdown and copy tests | 66/66 | `unit.txt` |
| Compiled native-answer and explicit handoff prompt contract | 2/2 | `prompt-contract.txt` |
| Preserved current-agent identity and terminal feedback regressions | 9/9 | `preserved.txt` |
| Real Worker/PG/recording IM group integration | 4/4 | `integration.txt`, `causal/` |
| Official Chromium, Chinese presentation and admission history at 1440/390px | 4/4 | `browser-report.json.gz`, PNGs |
| Web/Node typecheck and production Web build | Passed | `build.txt` |
| Server typecheck | Passed | `server-typecheck.txt` |
| Scoped affected E2E/fixture typecheck | Passed | `e2e-typecheck.txt`, `e2e-typecheck-config.json` |
| Lint of changed TS/TSX files and source diff check | Passed | `lint.txt` |

The Worker integration proves a descriptive six-agent roster creates one answer and one root run with zero successor runs. Explicit Chinese handoffs wake all five specialists once; the existing A→B→C→A chain, silent stop, accepted-message replay, frozen human identity, membership revalidation and mention/citation admission checks remain covered. `causal/` retains synthetic author IDs and run bindings, not private conversation content.

The browser uses actual MarkdownText, NativeMessageContent, the copy hook, official composer/quote components and Streamdown controls. It checks seven progressive plain/inline-code prefixes, six Chinese preset names, an unknown token, Chinese body/table clipboard output, quotation, rename, JSON history reload, selected mention identity and mobile overflow. Clipboard writes are instrumented locally; this is not an OS clipboard-permission or actual-provider quality test. The admission fixture also keeps the earlier #404 boundary covered.

Re-run with the repository's normal synthetic test environment and dedicated migrated test services:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit server/src/__tests__/conversation-dispatch.test.ts server/src/__tests__/conversation-handoff.test.ts server/src/__tests__/agent-chinese-name.test.ts server/src/__tests__/message-mentions.test.ts server/src/__tests__/mentions.test.ts src/lib/mentionPresentation.test.ts src/features/agents/state.test.ts src/features/chat/components/MessageActions.test.tsx src/components/assistant-ui/markdown-text.test.tsx
node server/run-integration-tests.mjs --file group-mentions.test.ts
npm run server:typecheck
npm run build
node_modules/.bin/vite --config e2e/group-mentions.vite.config.ts --host 127.0.0.1 --port 5185 --strictPort
E2E_GROUP_MENTIONS_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5185 node_modules/.bin/e2e run e2e/web/mentions-chinese.e2e.ts e2e/web/mentions-admission.e2e.ts
```

## Failed attempts and limits

The old local test DB retained 3.8.11 schema/package provenance, so the first integration hook correctly rejected it. Recreated only this task's dedicated synthetic test DB through the official migration path. One parameterized fixture initially kept the prior case's recording buffer; it now resets that buffer between cases. A browser test initially looked for a menuitem while Streamdown exposes buttons; it now uses the actual titled button. Editing/merging source during a browser run caused a Vite page reload and reset its fixture; the final run was taken after the source/build settled. A TipTap optional-attributes type error was fixed. These initial failures are retained in `attempts/` and are not counted as successful checks.

The repository-wide E2E typecheck reports existing alias/declaration and unrelated test errors; its raw result is retained. The affected fixture/tests also passed a scoped typecheck with the application's actual Vite and DOM declarations. No full historical test suite, full-SPA reconnect, real provider output, physical IME or production acceptance is claimed. Exact PR-head CI is recorded on the PR without another evidence-only head change. Both issues remain open until the sole publisher coordinates the release.
