# Scoped terminal failures

Baseline: `06e4a364f1355ae2c6bc027f84aa8674b88c6e4e`. Refs #466; keep the issue
open until the reported run can be inspected. The issue claim asks for the
message/conversation link or run ID plus approximate time. No original run,
student data or production request was available or accessed.

## Confirmed defects and implementation

The error title and process label were fixed to answer-generation failure, and
the apparent retry created a new regeneration request. In addition, a successful
main run's status could hide failed/cancelled successor work even when its
terminal feedback was present.

The product now projects a versioned public scope through the existing terminal
notice and run snapshot. It retains the actual root lifecycle/outcome, completed
answer and aggregate terminal error. The main IM acceptance payload remains a
main-answer receipt, not an aggregate failure payload.

| Evidence | Public scope and recovery |
| --- | --- |
| Current failed/cancelled root with no committed result | Response failure; retain any partial prose; explicitly regenerate a new answer. |
| Current successful root, matched result/request/fence/message and delivered state | Main answer sent; subsequent collaboration incomplete; refresh original progress. |
| Matched successful committed result, failed delivery, no matching acceptance | Delivery incomplete; retain the existing permission-checked retry-delivery action. |
| Matched committed result and authorized, validated accepted IM echo, delivery not finalized | Answer sent; finalization incomplete; refresh before further action. |
| Missing, stale or inconsistent evidence | Execution unconfirmed/incomplete; refresh, without claiming the visible prose was committed. |

The same presentation helper supplies process, conversation status and error
labels. Regeneration remains a separate toolbar action. There is no new endpoint
that retries all child tasks, no automatic resend and no error-text parsing to
guess a failure scope. Existing root/request/fence, authorization, idempotency
and delivery retry checks remain in force.

Terminal receipts fold only into the same conversation/agent/thread/run/request
and feedback identity/status. Derived notices now carry that identity and are
removed when a newer request or successful replacement arrives. Cancelled
successor feedback remains visible even when the main run itself succeeded.

## Focused validation

- The new fixed-title/scope and scoped-notice regressions failed before the
  implementation. An existing fixture also exposed an absent-versus-undefined
  `sourceMessageId` assertion mismatch; its unset field is now explicit.
- Final Web tests: 35/35 across `ConversationMessage.test.tsx`,
  `terminal-projection.test.ts` and `conversation-status.test.ts`.
- Final server tests: 31/31 across `terminal-feedback`, `terminal-delivery`,
  `assistant-transport`, `answer-first-projection` and `answer-revision-projection`.
  These include wrong-root/request/fence/agent rejection, accepted-echo proof,
  public failure counts, active/new-request protection, failed real sends and
  preservation of the completed main receipt.
- Existing official `e2e` / `@e2e-dev/web` terminal fixture: 2/2. Replay/reload
  retains one notice; a real follow-up-failure refresh sends zero new messages;
  explicit regeneration sends one. Synthetic local transport and content only.
- Scoped Biome lint, fixture TypeScript check, Web production build and server
  TypeScript check passed. No independent review or unrelated test matrix ran.

Raw final results: [Web](web-tests.txt), [server](server-tests.txt),
[browser report](browser-report.json). Browser command:

```sh
npm run dev -- --host 127.0.0.1
PLAYWRIGHT_BROWSERS_PATH=/workspace/browser-cache E2E_TELEMETRY_DISABLED=1 E2E_BASE_URL=http://127.0.0.1:5180 npm run test:e2e:web -- e2e/web/terminal-projection.e2e.ts --output .e2e/issue-466
```

The reused environment first needed both existing lockfiles reinstalled because
OfficeParser was absent. Nested server dependencies then shadowed the root graph
with Zod 4.5 / Node types 26 while the root/CI graph used Zod 4.6 / Node types 20.
Moving only that disposable nested `node_modules` aside restored the CI-style
single graph; server typechecking then passed without source/lock changes.
Initial new-code type errors, missing dummy test environment and a missing
ambient-declaration include in the temporary fixture check were corrected before
the final checks above. No credentials or network configuration were changed.

The first PR CI passed Web, server and deployment contracts, but the recovery
integration's exact metadata assertion still expected the previous five fields.
Its two failed cases received the intended new scope/version/public text. The
assertion now verifies those fields and equality with the actual durable system
notice; its existing no-resend and bounded model-call assertions stay intact.

## Remaining report boundary

This fixes confirmed classification, projection and recovery-label defects. It
does not establish whether the screenshot's failure was model generation,
collaboration dispatch, permission rejection or post-acceptance finalization.
Once the requested run identity is supplied, correlate its current request,
result/fence, main IM acceptance and successor terminal records using the
existing authorized diagnostics. That evidence is needed before closing #466.
Merge and production deployment belong to the designated sole release task.
