# Issue 248: startup, conversation loading and reversible removal

Initial baseline: `5b2f6e43`; rebased without conflicts onto `d00e5f7b93cd04405e2e2ee62f0879e8bd3e4b5f` after the memory-streaming integration (neither is asserted to be production).

Root causes and changes:

- Session verification and authenticated code download previously ran sequentially. Code now preloads while session verification runs; protected data still waits for authorization. StrictMode auth setup shares its in-flight session request.
- Workspace selection awaited the optional participant directory together with the authorized channel list. The directory now enriches messages after navigation without blocking it; concurrent roster fetches coalesce and epoch resets preserve scope isolation. System attribution is retained.
- Channel database rows and IM summaries were sequential; the authorized server list now reads them concurrently.
- Initial history and reload waited for run list/history plus stopped snapshots (up to the existing 30-second recovery bound). Ordinary/terminal IM history now paints immediately. Unconfirmed running rows wait for a separate accessible recovery state so stopped tasks do not flash active.
- Initial/reload HTTP coalesces by channel, cached visits use the existing scoped cache, and obsolete initial history requests are aborted. A single trailing refresh preserves invalidations during recovery. Workspace/user generations reject stale completions, including A→B→A. Channel revocation resumes both retained recovery and concurrent pagination.
- `ThreadPrimitive.Empty` resolves false when `isLoading=true`; therefore its nested conversation skeleton could never paint during loading. Product history/empty/error/recovery/streaming states now render independently, with retry, status/alert semantics and reduced-motion skeletons.
- There was no conversation deletion endpoint. Group leave is not deletion and rejects direct conversations. New personal list removal uses existing conversation authorization; confirmation explicitly preserves shared messages/membership, and the persistent removed-conversation dialog restores entries. No production conversations were used for acceptance.

Local timing comparison (adapter delays, **not production or browser-paint measurements**):

`node scripts/benchmark-chat-loading.mjs 5b2f6e43`

With history delayed 25ms and recovery released at 275ms, readable history moved from 278.43ms to 28.17ms. Warm cache reads used no additional HTTP (one total request in either run). See `timing.jsonl`; the regression also holds recovery unresolved and proves history becomes readable first.

Tests were written/red before implementation. Final owning check results are retained in this folder. `server-checks.md` documents the local database fixtures, initial outdated assertions and targeted green rerun. Browser/device/model acceptance and production deployment were intentionally not run.

Independent review identified swallowed refreshes, retained recovery cancellation, system attribution, and overlapping recovery/pagination; each was fixed. Shared integration files to watch: `src/features/chat/runtime/{transport,runtime,converter,model,store}.ts[x]`, `ConversationThread.tsx`, and `server/src/__integration__/migration.test.ts`. Activity aggregation, memory tools, and visualize UI implementation were not changed by this task.

Limits: authentication, project authorization and the history HTTP request remain required. Recovery errors remain visible with retry. Deletion means removal from this user's list, not removal from other members or destruction of history; restore retains the existing conversation-write permission requirement. Migration 0049 must be applied before serving the new list query. Only the designated integrator may merge and deploy.

Final check summary:

- Web owning suite plus targeted regressions: **73/73 passed** after rebase.
- Web lint: passed (5 existing warnings, 3 infos); server typecheck and targeted server lint: passed.
- Integration: initial 43/47, four old expectations corrected, then affected five cases passed. See server-checks.md for exact scope and isolation.
- Independent source review on `9c355f3b83319b8391d49e201fad1cf04099fa1a` found no remaining blockers after the recorded fixes. Final retry-state adjustment prevents an empty-state flash when retrying a failed empty history.
