# #378 static historical avatars

Base `86d4da8ff1e469888b738e7591e93f37cb4f9346`; isolated branch
`perf/378-static-history-avatars`. This is the historical-animation product
change requested after the idle-avatar hotspot was identified; no new profiling
or independent-review cycle was performed.

Historical, queued, waiting, completed and unconfirmed message avatars no longer
subscribe to continuous Bloub animation. The existing visual group's avatar stays
active if a later message in that same group is genuinely running with its exact
leased run identity and no unknown/released connection. The selector uses the
public message index, scans only that existing group, and returns a stable boolean.
It does not change grouping, mentions, permissions or message identities.

Bloub keeps its existing SVG identity and active animation/visibility clock.
A static avatar still acknowledges pointer move/leave through explicit single
samples at a fixed pose, without adding a clock or timer. System reduced motion
and offscreen gates remain. The pointer regression initially found that sampling
absolute shared time moved the silhouette; the helper now freezes the complete
sample time, so pointer feedback changes eyes and leaving restores the exact pose.

Developer checks: 36 focused tests passed (24 existing conversation-rendering,
7 existing identity/state, 3 group/activity, 1 pointer and 1 actual-avatar SSR
motion-policy check). Changed-source lint passed; the isolated interaction helper
and its test passed TypeScript. These establish the source behavior and rendering
policy, not browser geometry or measured CPU savings. SSR is not represented as
an effect/clock lifecycle measurement. Exact-head CI is tracked on the draft PR.

`ConversationMessage.tsx` changes only the avatar import/subtree. ConversationThread,
viewport/container code, dependency files, mentions and general metadata helpers
have no diff. The external performance owner retains the official0.15.31 viewport
work; local focused checks used the existing immutable0.15.16 shared installation.
No browser, build, provider, merge or deployment was run. Revert these avatar
source changes together for rollback; there is no schema or durable-data change.
