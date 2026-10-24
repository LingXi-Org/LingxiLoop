# #373: durable conversation-list waiting summaries

Fixed base: `6a10d3216f10a9c9f8ad4de5db636e66f35f56c0`. This is the bounded
follow-up to issue section4; #373 remains open. No product release, provider
qualification, private conversation read, dependency or migration change.

## Failure and ownership

`useConversationPresence` previously projected only loaded chat messages. A
conversation never opened in this browser therefore had no waiting/actor line,
although its actual persisted native run was waiting. The new row regression
failed before the wiring (expected one labelled wait, observed zero), then passed.

The existing `/im/channels` list owns scope and membership. Its existing DB/IM
reads stay parallel. A dedicated optional projection first narrows to this list's
company/project/member/public-protocol product bindings, then uses the installed
formal LingxiOS3.8.11 `listRuns`, `readRun` and `readApproval` exports. No native
SQL, event/chat-history traversal, admission, model dispatch or second durable
state system is introduced. API output includes only fixed kinds/actors and
scoped run/agent/requestVersion/fence identities, never question text, args,
preview, principal, usage or private model fields.

The native principal is the actual original human: product ingress derives it
from the committed human message (`receive.ts`), and admission's returned identity
and each product binding are checked again. This is not a tenant-wide service
principal. Active metadata outside the currently authorized binding set never
appears in a response.

## Bounds and current-state rules

- Empty list or binding set: zero native reads. One authorized session adds the
  formal `sessionId` filter. The formal API cannot accept a session/run ID array;
  for multiple sessions the trusted internal batch is limited to this tenant and
  human principal, then matched against current product bindings.
- Three active statuses only (`waiting`, `leased`, `queued`),100 records/page,
  at most4 pages/status: **12 native page reads/request**. No terminal/history
  scan. Pagination stops when exhausted or remaining pages cannot replace every
  selected latest-active candidate. No unbounded retry or page loop.
- At most6 selected waits are rechecked. A normal input wait needs one current
  `readRun`; an approval also reads the actual current approval and reconfirms
  its run. Thus at most18 additional formal reads; excess/incomplete coverage
  is `unknown`, with no guessed personal action. Current product read/write/control
  permissions are checked separately; these authorization DB reads are not
  included in the native-call counts.
- Run identity, request version and fence must agree. A cancelled/revised receipt
  cannot retain the old personal wait. An already decided approval is submitted,
  not another decision. A questionnaire must be the current delivered product
  interaction before assigning the human actor; uncertain/ongoing submission
  stays non-actionable. A missing reliable actor is unknown, never an inferred
  teacher/user.
- No cross-request summary cache. Existing list reload, socket reconnect and
  scope reset retain their own epoch guards; run-available also invalidates the
  list. A current local receipt for the same run may supersede the read snapshot;
  unrelated loaded terminal history cannot hide the unopened durable wait.
  This read-only summary is not an approval/input control; real operations retain
  their owning authorization/version checks.

## Recorded checks

Node22.23.3, existing immutable dependency symlink. On the initial candidate,13 owning helper, row,
label/identity, existing removal-scope and parallel-startup regressions passed.
They cover tenant/principal/session/binding exclusion; cancellation/revision;
resolved approval; unknown actor; pagination hard cap and early stop; repeat
reads without a retained resolved state; and row rendering without messages.
Focused lint on12 files, the standalone helper check, full `npm run server:typecheck`
and full `npm run typecheck` passed. Independent review and exact-head CI are
reported on the draft PR.

The initial real HTTP/PostgreSQL/formal-runtime integration passed **1/1** in3.061s
(owning runner6.260s). It used only synthetic data in a new dedicated
`373_list_20261024_test`, explicitly migrated through54, recording WuKong and an
in-process deterministic fake model. That fake ran once to produce a real
`chat.ask` durable wait; listing did not run or resume it. The first list actually
used **3 page reads +1 selected-wait read**. Same-human/tenant activity in another
course was excluded. Foreign tenant/project requests were rejected. Cancellation
cleared the wait, and removing membership returned an empty list with **0 native
reads**. The test did not request chat-message history. The dedicated database
had0 sessions before it was dropped; other databases were untouched.

Three earlier attempts failed during module setup because sparse checkout omitted
tracked `shared`, tiny `server/assets`, and the pinned visualize Skill. No business
assertion ran in those attempts. Restoring the existing tracked files allowed the
first actual business run to pass. These are setup failures, not application reds.
The first full server typecheck similarly found an omitted tracked
`e2e/homework/meter.ts`; its missing-type cascade is a separate setup failure.
The first web typecheck found two actual new typing mistakes (incomplete synthetic
row fields and nullable native lifecycle); both were corrected before the full
web check passed. No broad check is described as initially green.

Reproduction after an ordinary exact install and with dedicated synthetic services:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit \
  server/src/__tests__/channel-run-summary.test.ts \
  server/src/__tests__/channels-startup.test.ts \
  src/im/ConversationList.test.tsx src/lib/conversationRunSummary.test.ts \
  src/features/conversations/removal.test.ts
node server/run-integration-tests.mjs --mode selected --file channel-run-summary.test.ts
```

Use the existing integration runner's explicit test-DB/Redis safety gates and
fake endpoint policy; migrate that database before running. No credential or
private raw receipt is retained here. The test is selected explicitly, not added
to the default smoke list.

No browser slot was used. These checks establish bounded reads and synthetic
state/authorization behavior, not user-device latency, browser performance,
all #373 acceptance areas or production deployment. The snapshot can age until
the next existing list reload/event; it does not silently poll or wake work.
Rollback reverts these source additions together; no durable data/schema rollback.

## Independent-review corrections

Read-only review of `ffbbecef` found three P2 defects; that exact head's successful
CI40075052537 does not override those findings. Four newly added assertions failed
on it (same-fence local wait, unknown fallback, equal-time continuation and cap).
Their red output is retained in `review-regressions-red.tap` (trailing whitespace
only normalized; the original local TAP remains unchanged).

- Within one request/fence, native processing→waiting does not bump the fence.
  A matching local durable waiting receipt now supersedes the older processing
  read. Unknown without a run identity falls back to known loaded state. A queue
  after a decision is later than waiting within that fence, so it is not rolled
  back to the old local wait. Different-run terminal history and old versions
  remain ineligible; an explicit submitted receipt is still not another action.
- The native cursor sorts `(created_at,id)`, whereas public dates are milliseconds.
  Pagination may stop only when its time frontier is strictly older; equality
  continues or remains unknown at the12-page cap. No private cursor format is
  parsed. The same-time cross-status counterexample now passes.
- `goal.waiting` / `approval.pending` events themselves precede native `waitWork`.
  The existing DeliveryPort callback therefore ignores inline events and uses
  only its original native **event outbox** delivery context. A public run read
  must observe the same request/fence after the durable transition. If still
  leased, an ordinary delivery error retains the original bounded outbox retry;
  no new queue/timer/poll or native SQL is added. Only then does the existing
  `notifyRunAvailable` authorize and invalidate through the original WS path.

The helper/label/frontier focused regressions and the standalone helper types
passed after these corrections. The final full owning checks/CI and re-review
are tracked against the new PR head; local heavy typechecks were paused for the
integrator's higher-priority performance measurement window.

The expanded real integration passed **1/1**,9.357s scenario /12.894s runner.
Before the actual `waitWork`, a real channel-list reload observed **processing**;
an early outbox callback refused acknowledgement. The actual existing native
background event outbox subsequently published one existing Redis hint after a
public snapshot observed **waiting**. This establishes reliable post-park
continuation under the tested conditions, not just an event fired before commit.
Two authorized sessions in the current course plus another same-principal course
exercise the real multiple-session batch/binding SQL path. The measured list
still used3 native pages +1 selected-wait read, and the in-process fake ran once.
No external provider or browser ran. The new test DB again had0 sessions before
drop. `review-integration-result.json` and the new integration timings record it;
`initial-integration-timings.json` preserves the earlier narrower run.

The native retry emitted an expected events warning while waiting was not yet
committed. A terminal-outbox acknowledgement warning occurred during fixture
shutdown after membership removal; the test did not claim every outbox drained.
These warnings are retained as boundaries, not described as a warning-free run.

Exact8a2 CI40076109149 caught two missing required `RunEvent` fixture fields
(`seq`/`stage`) in the new invalidation unit test. Both synthetic events were
completed before the final CI retry; product implementation did not change.
This is a real new test typing failure, not an environment/setup failure.
