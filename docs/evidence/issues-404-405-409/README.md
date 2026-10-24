# Mentions incremental delivery: #404 implemented; #405/#409 awaiting coordination

Base: `86d4da8ff1e469888b738e7591e93f37cb4f9346`. Branch: `fix/404-405-409-mentions`.
Only synthetic participants, messages and local disposable PostgreSQL/Redis were used. No production messages, provider requests, deployment or merge.

## Ownership and completion boundary

Read all three full issues, their latest comments, open PRs and relevant prior PRs before claiming. No competing claim was found; registered this environment as the same owner in [#404](https://github.com/LingXi-Org/LingxiLoop/issues/404#issuecomment-6381969903), [#405](https://github.com/LingXi-Org/LingxiLoop/issues/405#issuecomment-6381970302) and [#409](https://github.com/LingXi-Org/LingxiLoop/issues/409#issuecomment-6381970712). Rechecked before preparing the draft.

The only production change is `server/src/mentions.ts`. The remaining files are dedicated tests, a synthetic browser fixture, and this evidence. This draft implements the reproduced #404 admission corruption; it does **not** implement #405 or complete #409. All three issues remain open. Independent review and exact-head CI must be recorded on the PR before integration. The sole publisher remains `01a16484-bef1-7317-8f6e-da46a18450e9`; any PR conflicts belong to the user.

Shared-file changes were reported before editing and are **pending coordinator allocation**, not denied or attempted:

- #405: `server/src/agent-runtime/delivery.ts` mention resolution immediately before `conversations.ingest`, shared with #406/#407 delivery work. The existing code treats every parsed body mention as a recipient. `conversation-handoff.ts` currently accepts any exact peer ID as a handoff. A single explicit dispatch contract must be used by both repair deferral and delivery; tables, descriptions, quotations and self mentions must remain inert. Keep frozen-audience/current-membership/capability checks and native budget/idempotency limits. These files were not changed.
- #409: `src/components/assistant-ui/markdown-text.tsx` (including partial streaming tokens), `src/features/chat/components/MessageActions.tsx`, `QuotePreview.tsx`, `runtime/quote-preview.ts`, `src/features/conversations/store.ts`, `src/features/agents/components/AgentEditor.tsx`, and `server/src/modules/agents/contracts.ts` (with owning settings tests). PR [#411](https://github.com/LingXi-Org/LingxiLoop/pull/411) now modifies MessageActions for #378, so this is a confirmed overlap. Existing preset naming in `participantDisplayName.ts` must be reused. Legacy custom English agent names need an explicit user-selected Chinese display name and validation; do not invent translations, mutate humans, or rename stable IDs. These files were not changed.
- PR [#412](https://github.com/LingXi-Org/LingxiLoop/pull/412) owns optional-metadata performance guards in `answerSegment.ts` and `runActivity.ts`. This patch imports their existing public helpers but does not change those files. `context.ts`, AuthGate and all other performance/delivery/replay files were left untouched.

## Reproduced failure, then correction

Failure model was encoded in `server/src/__tests__/message-mentions.test.ts` before implementation. The baseline `canonicalMessageMentions` scans `nativeText(message)` but walks every text part using `length + 1`. `nativeText` omits process/commentary and inserts no separator between contiguous v3 answer segments. The first incorrect boundary in these fixtures is canonicalization at admission: text is correct before it, then later mentions gain trailing letters or overwrite adjacent characters. Length-changing Chinese aliases also invalidate source/citation ranges.

With the exact same formal dependencies, baseline source passes **1/10** new cases; the corrected implementation passes **10/10**. The baseline test was generated temporarily from `git show <base>:server/src/mentions.ts`, run against the same regression, and removed. See `baseline-red.log` and `unit-green.log`.

Correction resolves the existing shared parser once against the exact body, applies replacements in body coordinates, and maps included text-part boundaries through the same edits. It follows nativeText's original inclusion and separator rules. A token split across contiguous parts is assigned to its first part; source message/segment/part identities remain stable while presentation start/end offsets follow changed lengths. Citation bounds use the same edit mapping. Explicit process text is unchanged. No history rewrite, fuzzy matching, dispatch-policy change, ID change or runtime change is included.

## Executed checks

| Check | Outcome | Evidence |
| --- | --- | --- |
| New admission regressions | Baseline 1/10 → candidate 10/10 | `baseline-red.log`, `unit-green.log` |
| New + existing shared mentions + nativeText | 23/23 | `unit-green.log` |
| Existing v3 source/transport regression | 5/5 | `source-projection-green.log` |
| Real local PG + recording WuKong HTTP | 1/1 | `integration-green.log`, `integration-timings.json` |
| Official `tester-army/e2e` / `@e2e-dev/web` Chromium | 2/2, 1440px and 390px | `browser-report.json`, `browser-summary.md`, PNGs |
| Server typecheck | Exit 0 | `server-typecheck.log` |
| Lint of five changed TS/TSX files | Exit 0 | `lint.log` |

Integration covers correct synthetic contiguous answer → actual `acceptAgentMessage` → canonical HTTP send/receipt → same-nonce retry (one send) → authorized history after rename → exact IDs/citation slices. It uses the real product migration path into a dedicated local test database and the repository's existing recording WuKong server, not a production IM endpoint. The browser uses actual NativeMessageContent/MarkdownText and shared naming on synthetic source slices, performs admission twice plus JSON history roundtrip, checks seven badges including all six presets, exact adjacent Chinese text and no horizontal overflow. It does not prove full-SPA reconnect, real provider output or #409 partial-token/copy/export behavior.

Reproduction (after normal locked `npm ci`, externally migrated dedicated test PG and Redis):

```sh
node --import tsx --test server/src/__tests__/message-mentions.test.ts server/src/__tests__/mentions.test.ts src/lib/nativeText.test.ts
npm run server:typecheck
node server/run-integration-tests.mjs --file message-mentions.test.ts
node_modules/.bin/vite --config e2e/group-mentions.vite.config.ts --host 127.0.0.1 --port 5184 --strictPort
E2E_GROUP_MENTIONS_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5184 node_modules/.bin/e2e run e2e/web/mentions-admission.e2e.ts
```

Set the runner's required synthetic environment variables as in the CI workflow; use a database name containing `_test`. The local browser cache was under `/tmp/mentions-e2e-browsers` via `PLAYWRIGHT_BROWSERS_PATH` for the official install/run commands.

## Failed attempts and environment limits

Root `npm ci --ignore-scripts --prefer-offline --fetch-retries=0` installed exact formal LingxiOS **3.8.11** from the lock URL, with tarball integrity verified. No 401 occurred. A preinstalled nested `server/node_modules` still resolved LingxiOS **3.5.2** and a different Zod version, causing unrelated type errors; it was moved outside resolution to `/tmp/mentions-legacy-server-node_modules`. Typecheck then passed without lock/product edits. One migration attempt raced this move and failed to locate old dotenv; the standard migrated test database succeeded after dependencies settled.

The first browser install failed because its default home cache directory was unavailable; the official installer succeeded with a writable `/tmp` cache. The first integration invocation omitted its required invitation base URL. Initial authored assertions wrongly compared the duplicate receipt flag and reaction-enriched history metadata to the first receipt; they now compare the actual duplicate contract and unchanged content/identity. Initial browser assertions relied on engine-normalized text around badge boundaries; the final test uses a boolean native-DOM exact-text check and retains before/after equality. These initial assertion failures are retained in `integration-fixture-first-failure.log` and `browser-fixture-first-failure.log`. They are not product baseline failures.

The extra v3 source check first omitted required synthetic env, then ran without the runner's `--test-force-exit` and retained imported service handles after its tests passed; that process was stopped and the standard force-exit invocation completed 5/5. The actual correction and all final outcomes are separated above. No independent review, production-state reproduction, actual-provider acceptance, full-app reconnect, #405 run-count acceptance, or end-to-end #409 naming acceptance is claimed.

Terminal log trailing whitespace is normalized for repository diff checks; the official browser JSON report is retained unchanged.
