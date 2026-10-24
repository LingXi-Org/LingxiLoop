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
- Biome focused lint: 13 files passed. `tsc -p server/tsconfig.json --noEmit` passed. Web typecheck initially failed only because sparse checkout omitted the tracked streaming range utility; it was restored from the same base before rechecking.
- Initial approval regression failed on missing explicit receipt state, then passed after implementation. Initial message suite failed on the sparse missing range utility, then passed after restoring it.
- Browser acceptance is separate and still pending: inspect approval public context and grant/execute/unknown receipts; reload a text+uploaded-reference draft; switch account/course/thread and verify isolation; reload an incomplete questionnaire, submit, then confirm server receipt wins. Verify no second pending message on failed send/reconnect using the original outbox.

## Boundaries and rollback

The public preview intentionally omits unreviewed fields and does not invent counts or course names. Recovered image references use file-ID attachments and have no persisted thumbnail URL. Draft caching is optional when browser storage is disabled/full; the active input and existing pending-send outbox retain their prior behavior. No claim of cross-device draft sync, storage durability on browser eviction, or recovery of uploads that never finished.

Rollback: revert the issue commits; no migration or native contract change. V2 local cache can remain unused. Final production/deployed behavior requires the integrator's independent review, browser verification and exact release checks.
