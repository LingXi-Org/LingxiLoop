# PR265 independent review — aac9d745

**Decision: HOLD for one P2 before GO.** Exact head `aac9d745140cd0243e530351039b557537d60da3`, base/merge-base `c66e847d14f838e72d0ab19e252e6cd4e2b68a76`. Reviewed on 2026-10-21 using Git objects, the repository-review skill, existing evidence, and a small synthetic lifecycle probe. No production or private diagnostic access, browser expansion, installation, or full-suite rerun.

## P2 — reopening settings can retain a successfully restored conversation indefinitely

Location: `src/features/settings/RemovedConversationsSettings.tsx:20-32,34-42`; owning mount at `src/features/settings/DataAccountSettingsPanel.tsx:24`.

Sequence:

1. Start restore while the conversation is removed; hold the response.
2. Close settings, unmounting the old component and aborting its read controller.
3. Reopen before the restore completes. The new component reads the still-removed row.
4. The old restore succeeds. The real store can reload the normal conversation list, but the old component's `current()` is false and correctly discards its own local update. The new settings component neither subscribes to a restore invalidation nor reloads; it keeps showing the restored row as deleted until another manual close/reopen or retry.

This is a presentation consistency regression caused by the new component lifetime. The previous RemovedConversationsDialog component lived outside its own dialog content in ConversationsPane, so close/reopen retained the same row state. The new settings component is unmounted with settings content. Server durability, permissions and membership are not corrupted.

The exact source callback probe reports `authoritativeRemovedRows=0`, `actualVisibleRows=1`, `notifications=0` after the sequence. It uses compiled exact-head component source with controlled hooks/lifecycle and synthetic API boundaries; it is **not** a real browser or backend integration test.

Smallest correction: signal successful restore independently of the initiating view's lifetime, scoped by the existing captureConversationScope guard; let the current settings instance invalidate/refetch its removed list. Keep mutation/view-lifetime fencing separate from list-read cancellation so this refetch cannot strand the initiating row's pending state. No server changes or sensitive global row cache are needed.

## Related close-animation boundary

The same callback currently checks only the captured read controller and conversation scope. Settings closing does not directly fence it. The exact locked Radix Presence 1.1.10 keeps animated content in `unmountSuspended` until animationend; DialogContent has a 100ms exit animation. Restore completion in that interval can still emit a toast after settings closes. The callback model reports one notification before cleanup versus zero after full unmount. Existing browser coverage waits for Escape to complete and does not establish this immediate interval. Include an immediate close/section-session fence in the small correction; do not rely solely on effect cleanup or a boolean that becomes true again on rapid reopen. This is a related lower-severity UI edge, not a separate data/authorization finding.

## Verified unchanged semantics and controls

- Only four production frontend files change. API/store/server/permissions/migrations/dependency locks are byte-identical to base.
- Existing restore uses POST /conversations/:id/restore and the original store scope check before dispatch, after response, and after normal-list reload. It does not cancel or pretend to roll back a committed restore when settings closes.
- Server router lines145-159 still requires conversation:write. Application setRemoved lines300-310 still locks the conversation, checks company/project/member, then updates personal list-removal state transactionally; it does not hard-delete shared history or remove membership.
- The new per-user/company/project key and existing scopeEpoch fencing continue to reject old-scope completions. Read failures expose retry; restore failures preserve the row and re-enable retry; pending controls are disabled.
- Synthetic controls pass: normal success => rows0/notification1; failed restore => row1/error, retry => rows0/notification1; changed scope => notifications0.

## Evidence and reproduction

```sh
node /workspace/settings263-review/lifecycle-probe.cjs
```

Expected current-head exit: 1. `lifecycle-probe.json` records synthetic counts, exact head, source SHA256 `74e77df7a7c41c97551590fa0f7df41361ef4f91026660f1eab619b17f624d99`, and zero network requests. FAILURE-MODEL.md was recorded before the probe.

Existing submitted evidence is accurate in its stated scope: settings/removal checks 5/5; official @e2e-dev/web Chromium component tests 3/3 (run 01a15c54-54b3-7e3b-8bdd-0d97515137c3). They cover full close followed by restore completion and then reopen, not reopen-before-completion. Type/lint/build are author evidence, not independently rerun. Independent git diff --check passed. GitHub read-only API independently confirms exact-head CI 39534408493 completed/success; that green CI does not cover the sequence above.

No P1 or authorization regression was found. No production acceptance is claimed. Root remains the sole integrator/releaser.
