# Issue 331: incomplete answer presentation

Written before the regression and UI implementation. All examples are synthetic.
No original conversation, screenshot, production log, or provider data is used.

Confirmed failure paths:

- Published LingxiOS 3.8.2 `consumeAssistantMessage` maps partial/blocked goals to
  native `RunView.lifecycle` partial/blocked. `consumeRunState` also preserves
  the runtime status. The product does not normalize these to succeeded.
  Both native partial/blocked and legacy succeeded + partial/blocked goal map to
  `incomplete/other`; the old HarnessDetails guard only handles succeeded.
  assistant-ui's `MessagePrimitive.Error` only renders for `incomplete/error`.
- HarnessDetails suppresses the incomplete explanation whenever any body text or
  artifact exists. A short next-step note can therefore hide the outcome warning.
- With empty content, the action bar is also absent: a known source message still
  has no retry entry. Process-only content gets only a generic regeneration icon.
- Replaying the same terminal must not duplicate the recovery UI or trigger work.
- Retrying must use the existing explicit new user-message path, target the same
  source/branch, and coalesce pending clicks. It must not resume tools implicitly.
- Read-only conversations, missing targets, another running task, cancellation,
  waiting states, stale outcome versions, and successful answers must retain
  their existing controls; partial/blocked must not override those states.
- Useful text, delivered artifacts, citations, and public activity must remain
  unchanged. Public-text purpose and supersession are outside this UI change.

Regression plan: render partial and blocked with empty, text, process, and artifact
content; verify one concise status line and retry entry while preserving content.
Partial/blocked should not become a prominent error card or expose diagnostics.
Use the official browser engine against an isolated synthetic fixture to check
replay/reload, keyboard retry, pending-click deduplication, new message identities,
and read-only/running/cancelled protections. The fixture blocks external APIs and
does not execute tools. Original-incident causality requires the publisher's
separate, minimally redacted production diagnosis.

Validation (2026-10-23):

- Before implementation, the component file had 20 passing and 2 failing tests;
  the native partial presentation had zero recovery statuses. The official web
  regression also failed at the first expected status, with no matching node:
  `.e2e/issue-331-ui-red/report.json`.
- After implementation, ConversationMessage, terminal-projection and
  reply-branches pass 31/31. The matrix covers native partial/blocked and legacy
  succeeded with empty text, body text, activity, citations, presentation and
  persisted artifacts. Cancelled, failed, waiting, active and stale-version
  cases do not gain an incomplete recovery status.
- Official web regression passes 1/1:
  `.e2e/issue-331-ui-green-final/report.json`. Its two screenshots preserve
  synthetic prose and a PDF artifact beside a concise status. It covers native
  partial/blocked, empty results, replay/reload, missing targets, read-only and
  other-running guards, keyboard activation, pending double-click deduplication,
  distinct subsequent user-message IDs and cancellation. State and IM boundaries
  are synthetic; projection, UI and send transport are real. No provider or tool
  is executed, so this does not prove cross-request tool-side-effect idempotency.
- Web typecheck, E2E typecheck and web lint pass. Lint retains the existing five
  warnings and three informational findings outside this change.
- Existing terminal-identity browser coverage passes in
  `.e2e/issue-331-ui-compatibility/report.json`. The diagnostic-placeholder browser
  check initially stopped before the changed assertion because it did not open
  the current RunActivity details disclosure. With that test interaction updated,
  it passes 1/1 in `.e2e/issue-331-ui-diagnostics-final/report.json`, including the
  legacy succeeded/partial snapshot, no diagnostic prose, and failed-run retry.
  Its snapshots came from `observed-progress.test.ts` (3/3) under synthetic
  unit-test environment values and a disabled dotenv path.

Reproduce the focused UI regression with the official browser engine:

```sh
node node_modules/vite/bin/vite.js --config scripts/vite.ui-experience.config.ts --host 127.0.0.1 --port 5196 --strictPort
E2E_BASE_URL=http://127.0.0.1:5196 npm run test:e2e:web -- e2e/web/incomplete-answer.e2e.ts --output .e2e/issue-331-ui
```

The recorded cloud run additionally used `E2E_CDP_URL=http://127.0.0.1:9228`
with disposable local Chromium through the official engine. No persistent
permissions or production configuration were changed.
