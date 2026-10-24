# Issue 373: approval, wait state and draft recovery

Base: `2686f475eac075bc9033f13714d5d6bbfa5078eb`. Node 22.23.3, installed published LingxiOS 3.8.11. Synthetic local checks only; no production reads, deployment or provider execution.

## Contract audit and changes

- Native `ApprovalDecision` (public package export) only accepts `approved: boolean`. All six approval-required product producers use binary approval: `documents.delete`, `knowledge.set_source_enabled`, `knowledge.delete_source`, `presentations.approve_outline`, `routines.create`, `routines.activate`. None produces approval options. Existing option-bearing protocol records remain visibly unsupported; no invented option submission or runtime patch.
- `approval-public-view.ts` maps actual, already-authorized producer previews to fixed public fields: title, reviewed version, visibility, concrete change, audience/page count and schedule/timezone/effect. Raw args, full preview, instructions, principal/internal scope and raw results no longer cross the approval-read browser boundary. Authorization and execution inputs remain unchanged.
- Native grant with no execution receipt is `APPROVED`, not `FAILED`. UI distinguishes waiting for approval, granted/waiting execution, executed, rejected, failed and unknown. Unknown outcomes advise checking the original operation first. Run/request/approval identities and the existing server decision endpoint remain unchanged.
- Conversation rows summarize loaded durable run states using `conversationRunStatus`; unresolved effects and real waits take precedence over unrelated completed runs. Actor labels use actual control permission, never an inferred teacher role. Unloaded conversations retain ordinary preview text.
- Composer scope includes tenant, account, course, conversation and thread. Scope changes remount the composer so pending uploads cannot migrate. The existing draft module now caches bounded text and uploaded key/name/MIME references for seven days (100 drafts, 20,000 characters each). Browser Files, download URLs and credentials are never serialized. Restored references use the existing native file-ID attachment contract; server send rechecks owner, membership and media identity. Unfinished uploads must be selected again.
- Incomplete questionnaire answers use a separate namespace under the same scope. Durable pending/resuming/submitted/unavailable receipts supersede the local cache; submitted answers remain server-owned. Existing request identity, retry/reconcile and read-only gates are reused.
- Existing outbox and bounded run recovery remain the owners of sent-but-unconfirmed messages and reconnects. No second delivery queue. Refresh observes the original run; missing/unknown outcomes tell users to check existing effects before starting again.

## Verification

- Focused eight-file node test command: 37 passed, 0 failed, 0 skipped (`ConversationMessage`, `message-presentation`, `run-recovery`, `error-recovery`, `conversation-status`, `approval-context`, `drafts`, `approval-public-view`). Draft regression rerun after corrupt-cache repair: 1 passed.
- Biome focused lint: 13 files passed. `tsc -p server/tsconfig.json --noEmit` passed. Web typecheck passed after restoring the tracked streaming range utility omitted by sparse checkout.
- Initial approval regression failed on missing explicit receipt state, then passed after implementation. Initial message suite failed on the sparse missing range utility, then passed after restoring it.
- Independent review by `cover_ui` found a knowledge preview field mismatch: the actual producer uses `visibilityScope`, not the repository row's `visibility_scope`. Corrected with a failing-before/passing-after producer-shaped regression and an explicitly reviewed ISO version field in `3910d200`; reviewer reran four focused files (5/5 pass) and closed the finding with no additional P1/P2.
- Artifact question drafts share this cache through the `artifact-question` namespace (consumer owned by the learning workstream).
- Three focused browser scenarios and configuration are committed in `e2e/answer-first/state373.e2e.ts` and `e2e.state373.config.ts`; their focused TypeScript check passed. The broad existing E2E config has unrelated recovery-test JsonValue/Promise<void> and alias-resolution failures, so it is not reported as passed.
- The original browser acceptance checklist was: inspect approval public context and grant/execute/unknown receipts; reload a text+uploaded-reference draft; switch account/course/thread and verify isolation; reload an incomplete questionnaire, submit, then confirm server receipt wins. Verify no second pending message on failed send/reconnect using the original outbox.

## Boundaries and rollback

The public preview intentionally omits unreviewed fields and does not invent counts or course names. Recovered image references use file-ID attachments and have no persisted thumbnail URL. Draft caching is optional when browser storage is disabled/full; the active input and existing pending-send outbox retain their prior behavior. No claim of cross-device draft sync, storage durability on browser eviction, or recovery of uploads that never finished.

Rollback: revert the issue commits; no migration or native contract change. V2 local cache can remain unused. Final production/deployed behavior requires the integrator's independent review, browser verification and exact release checks.


## Browser execution (2026-10-24)

The three official-engine scenarios were attempted with the actual product runtime/provider and the two isolated synthetic HTTP pages. All reports are retained in the worktree under `.e2e/state373-run`, `.e2e/state373-diagnostic`, and `.e2e/state373-restarted`; see [attempt metadata](state-browser-attempts.json). Trace/video were disabled. **No scenario has a complete passing run.**

The first run passed the initial text+uploaded-reference restore/reload steps, incomplete questionnaire reload+submission, and pending/granted approval labels. Subsequent navigation/reload produced blank pages. A fixture-only error display was added; the next run explicitly reported `ENGINE_FAILURE: Target crashed` for all three scenarios. The integrator then authorized exactly one restart of the batch-owned CDP9337 browser with its original arguments and no security-setting changes. The last three-scenario run still failed, including a target crash and failed fixture module loading. No further retries were made.

During the last run `/tmp` free space fell from roughly 439–481 MiB to 9.8 MiB and recovered after test contexts closed; the cgroup OOM-kill counter stayed at its pre-run value of five. This suggests temporary browser storage pressure, but the root cause is not established. Do not classify the failed browser acceptance as a product pass or infer a specific business-state regression from these crashed/blank targets.

Cleanup: Vite53124 stopped, no own fixture pages remained, and only `/tmp/loop-state373-vite-cache` (163 MiB) was removed. Reports/screenshots remain. Controlled CDP9337 was handed to the learning workstream, PID475439 / exec session38900, retaining the original profile and flags. No production, private API, model, install, or deployment action occurred.

## PR #380 compatibility review

Read-only review of exact `84909cb8508313bf0ed28424d5ff9759692eaece` found no additional P1/P2 or conflict with this batch. All nine `docs/evidence/issue-375/checks.json` source hashes match the commit's actual bytes. Existing regressions were not rerun. The integrator must preserve `components={{ pre: CaseCodeBlock }}` when integrating the #376 CasesPage cover changes. The shared Memos renderer retains its Mermaid dispatch; changes concern exported source rendering, real newline text nodes and dark token colors. ContentEditor/schema and scoped content CSS do not change chat draft, approval, or cover contracts. Existing Chromium-only and broad-E2E-typecheck limitations remain. CI40066611141 success was supplied by the parent, not independently queried here.
