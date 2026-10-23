# #354 — one public task plan across progress updates

The old projection keyed every `chat.report_progress` item by run, request, lease fence, model attempt, and item ID. A plan with the same explicit ID therefore became a new card after every model/tool round. The screenshot is private; this evidence uses only synthetic tasks.

The product projection now gives plans one identity per run/request/explicit plan ID. It retains the first recorded position and chooses later accepted versions by actual fence and completion event sequence. A higher-fence recovery cannot be replaced by an older lease's late event. A newer truthful revision may lower the progress count: this is not a `max(activeIndex)` heuristic. Other task IDs and request versions remain distinct even with identical text. Ordinary explanations retain their existing attempt isolation. Failed progress reports remain visible failures and never advance a plan.

No runtime dependency, event ledger, usage accounting, task execution, permission, database schema, or production configuration changes. Raw durable calls remain available; only their public plan projection updates in place.

## Validation

- Failure model was written before implementation. Three initial owning regressions failed with 2–3 cards for one explicit task. A separate failure-first regression showed a failed report incorrectly replacing the plan with 4/4; the guarded projection corrects that too.
- Owning `run-activity-projection.test.ts` plus `durable-public-projection.test.ts`: **15/15 passed**, covering distinct task/request identities, reordered completion, stale fences, genuine downward correction, full snapshot/history identity, replay/reconnect, cancellation, failed reports, and preserved explanation isolation. The tests use published LingxiOS 3.8.5 public projection APIs, no model or production calls.
- File lint and whitespace checks pass.
- Local `server:typecheck` passes after correcting the new test helper's union-array type inference. The prior candidate's server CI failed and is not reused; the corrected candidate still requires its own successful CI.
- Official `e2e` / `@e2e-dev/web` browser test is committed and uses captured `RunStreamProjection` frames through the existing real AssistantTransport/store fixture. Its first execution failed before product assertions because the Vite esbuild service terminated during concurrent builds (`The service is no longer running`). This is recorded as an incomplete browser check. Root will run it serially before release; no passing browser claim is made here.

To capture frames, run the owning projection tests with `TASK_PLAN_SNAPSHOTS=.e2e/issue354-plans.json` and the existing synthetic server test environment. Serve `e2e/vite.react-activity.config.ts` on a free loopback port. Then run the official engine with `E2E_BASE_URL` and `TASK_PLAN_SNAPSHOTS`, selecting `e2e/web/task-plan-identity.e2e.ts`. The browser checks 0/4 → 1/4 → 4/4 in one stable card, stale replay, history reload, cancellation at 1/4, and 390 px layout.
