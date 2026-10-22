# Activity history failure model (#304)

This scoped test plan precedes implementation. Browser integration belongs to the parent branch.

- A page for another run/request version/fence/message fence, must never enter the current history. A page older than the sequence captured by its request must also fail.
- A stale request resolving after cancellation, retry, or unmount must not change loading, errors, cursor or entries for its replacement.
- A page may contain no more than 40 parts and must advance by its actual returned count; malformed identity, totals, duplicate identity or cursor information must fail visibly without erasing loaded records.
- Offset pagination describes a snapshot. Live sequence changes must not trap readers on page one. Same-scope pages at or above their captured request sequence may finish while live advances; only read-only activity is merged and current live identities always win. An explicit second pass from zero after the first traversal covers insertions such as accepted-prefix archival. There is no automatic loop.
- Multiple pages preserve authoritative event order and stable identity. A newer live tool/approval state always wins; historical content cannot replace the live message, body or authority.
- Failure/retry and duplicate load gestures preserve the cursor and existing records. Only one request may run per consumer; no automatic unbounded fetch loop.
- No history request occurs before an explicit load. Reload/reconnect initializes from the current live scope, not a previous component's cache.
- History uses official read-only assistant-ui providers, a separate message containing only the requested activity, and harnessControl false. It must never acquire live runtime methods or reactivate historical forms.
- Legacy records without optional order/revision stay in server page order. Records without a valid public activity annotation cannot become history.

## Implemented boundary and focused evidence

The frontend accepts a page only when its run, request version, fence and message fence match the active scope and its sequence is at least the sequence captured when the request began. A later live event does not prevent reading an already authorized, read-only page. The live renderer always owns duplicate activity identities; historical revisions cannot replace newer cached/live values. A changed sequence during a pagination pass schedules an explicit follow-up pass at offset zero after reaching the end, covering inserted archive records without automatically fetching or repeatedly returning to page one. Main transport snapshots and their 80-item/structural bounds are unchanged.

`HistoryActivityScope` uses the installed official `ReadonlyThreadProvider`, `MessageProvider` and `PartByIndexProvider` from `@assistant-ui/react` 0.15.16. Each page activity has a separate one-part read-only message with `harnessControl: false`. The owning native renderer must also set its existing read-only rendering context, so historical input/approval widgets are omitted rather than merely disabled.

Local baseline: product main `d5481cd258058784e7004169b5ef1235460384f1`, formal runtime 3.8.2; public annotation additions from contract commits `98cebf04` and `940d500d`. No production access or deployment was attempted.

- Before implementation: the new suite failed because the history module did not exist. The first strict sequence cancellation implementation then failed three new live-pagination regressions (forward progress, late same-scope response, archival insertion).
- After the bounded read-only merge: 12/12 focused tests passed with Node 22.23.3 using `node --import tsx --experimental-test-module-mocks --test src/features/chat/runtime/runActivityHistory.test.ts src/features/chat/runtime/harness-activity-api.test.ts src/features/chat/runtime/harness-api.test.ts`.
- Changed-file Biome lint passed. Web `tsc --noEmit --pretty false` passed on the implementation. Integrated layout/browser checks are owned by the root branch and are not claimed by this focused evidence.

Follow-up regression: missing optional legacy revision metadata initially overwrote a known approval receipt; the new test failed before the merge rule was tightened. Delivery-purpose records are also rejected from process pages, matching the server filter. Both focused regressions pass with the final helper.

## Independent review follow-up: REST watermark ahead of live

The reviewer reproduced a pagination loop with live sequence 120 and a stable API page sequence 121. Each traversal incorrectly used live sequence 120 as its baseline, so even unchanged API pages requested another pass forever. Two regression tests failed before the fix: stable one-page/multi-page responses did not terminate, and a changed API followed by a stable replay still reset to offset zero.

Each traversal now takes its first successfully verified page's actual sequence as the history baseline. Subsequent page changes or live progress beyond the returned page still request an explicit follow-up pass. The page sequence remains local to read-only history and never advances live message/control state. Focused coverage includes stable one-page and 85-entry cases, a server-side insertion between pages with a lagging live stream, and the existing live-update/retry/fence regressions.

A second review finding covered requests that never resolve. `harnessApi.activity` now uses the same 30-second timeout combined with the caller's signal as existing run reads. A controlled deadline test failed before implementation and now proves timeout rejection leaves the caller signal un-aborted, so the hook enters its existing recoverable error path. Loaded records and the current offset survive and an explicit retry completes. Caller cancellation independently aborts the request and remains covered by the hook's existing silent scope/unmount guard. The timeout test uses a controlled deadline signal rather than waiting 30 seconds.

Review follow-up validation: 16/16 focused tests pass across `runActivityHistory.test.ts`, `harness-activity-api.test.ts` and `harness-api.test.ts`; changed-file Biome lint and `git diff --check` pass. The two watermark regressions and missing-timeout regression were observed failing before their owning fixes.
