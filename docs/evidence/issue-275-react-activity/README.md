# Public process in RunActivity; live answer in the body

Refs [#275](https://github.com/LingXi-Org/LingxiLoop/issues/275). Implementation `733762f6ee852c6799eb06d5cb77507eb97b4ed2`, based on `63948c598b9778a35941f3dcabf8ef57e2e2d6d8`, formal LingxiOS 3.6.0.

The product previously labelled every public-text part as commentary and rendered explicit process alongside the answer. This change uses public request/fence/attempt identity, tool-ended events, matching tool events, and accepted-result association. Current unresolved public text remains a live answer candidate. Tool preambles, superseded attempts, explicit progress reports/plans, and observed status belong in one RunActivity disclosure. Only the exact accepted source prefix is replaced by the final answer. A collapsed running activity shows a bounded public summary; answers, rich tools, approvals and recovery controls stay outside it.

No text matching, language keywords, private runtime state, new public runtime API, migration or dependency change is used. Existing validated visualize-reference projection remains authoritative. Public process before or after a committed result stays in the disclosure; a failed/cancelled current answer fragment stays visible. The old aggregate activity-history entry points remain absent. Source records are not deleted or rewritten.

The existing product-rules paragraph and native `chat.report_progress` description now tell the model to publish process/status through that tool while streaming substantive explanations in ordinary response text. The integrator must apply the same wording to PR276's newly extracted system-skill/visualize adaptation text; this independent branch intentionally does not change that concurrent skill-selection implementation.

## Validation

- Before product changes: public-event projection 1 pass / 5 fail; separate real React SSR file 15 pass / 1 fail. An initial sparse-checkout import error is retained separately in the original combined red log and is not counted as a product defect.
- After correction: 49/49 focused tests, covering current streaming text, explicit tool-phase classification, identical text across different attempts, failures/cancellation, result-first history replay, accepted-source deduplication, inert unverified visualize references, canonical IM merge and UI controls.
- Official `@e2e-dev/web` with its existing Chromium 1243 cache: six selected real browser cases passed in 19.52 seconds. These exercise actual HTTP stream decoding, message-store reconciliation and React components with synthetic snapshots produced by the owning server projection. The new case was rerun successfully after adding animation settlement for reproducible screenshots. Browser reload is followed by synthetic history replay; this is not a fresh database/provider test.
- Web, server and E2E typechecks passed; targeted lint passed for 16 files. The final screenshot-settlement addition is only a finite-animation wait with the same already typechecked official evaluate signature.
- The existing synthetic receipt-render check observed **49.10 ms** from receipt to paint. This is neither provider TTFT nor production latency and is not an optimization before/after claim.

An existing 1100-call unit case exceeded the local 30-second process deadline, aborting that larger batch. It was not reported as passing; the final focused set excludes that file. No full suite, provider, production request, Docker fixture or dependency installation was performed. Final merged-head CI and deployment remain the integrator's responsibility. The temporary local Vite process was stopped after verification.

## Reproduce

Use existing formal 3.6.0 dependencies and the synthetic environment defaults in `scripts/run-tests.mjs`, with `DOTENV_CONFIG_PATH=/dev/null`. Run Node with `--import tsx --experimental-test-module-mocks --test --test-concurrency=1` over:

- `server/src/__tests__/{react-public-purpose,durable-public-projection,repair-public-projection,visualize-public-boundary}.test.ts`
- `src/features/chat/components/ConversationMessage.test.tsx`
- `src/features/chat/runtime/run-updates.test.ts`

Set `ISSUE275_SNAPSHOTS` to a private output path while running the first test to generate synthetic browser input. Start `vite --config e2e/vite.react-activity.config.ts`; set `E2E_BASE_URL=http://127.0.0.1:5197`, `E2E_PROJECT=web`, `E2E_TELEMETRY_DISABLED=1`, and `PLAYWRIGHT_BROWSERS_PATH` to an existing official browser cache. Run `e2e run e2e/web/react-public-activity.e2e.ts --workers 1 --retries 0` with that snapshot path. No browser installation is required or authorized by this evidence.

3.6.0 cannot know a future tool call from the first text chunk. Unresolved text therefore remains visible until public evidence establishes its purpose; explicit process reports should use `chat.report_progress`. The change does not guarantee semantic classification of arbitrary prose embedded by a model inside its final answer.

`receipt.json` binds source and evidence hashes. Text copies have trailing whitespace removed; original logs remain in the private task directory. Screenshots show synthetic component fixtures only.
