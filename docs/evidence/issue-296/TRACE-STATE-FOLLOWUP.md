# Trace terminal-state follow-up for runtime 3.8.2 adoption

Failure boundaries: a known `partial` or `blocked` lifecycle must not become `unknown`, `complete` or a running clock; the actual execution interval must remain unchanged. A genuinely unknown state must stay unknown. A fallback without a recorded execution interval must retain null endpoints.

This additive product patch is for issue 298's formal runtime 3.8.2 upgrade, which includes 3.8.1's public terminal states and the subsequent SSE correction. It must not be released independently against 3.8.0, whose public trace reader still folds these two states into unknown.

Tests were written first. The two render cases initially failed because the status labels were absent. Additional fallback assertions initially failed because an unresolved tool inherited the run's outcome. The patch preserves that tool's unknown outcome while keeping the known root state. DTO/fallback/render regressions then passed 4/4, and adjacent trace regressions passed 27/27. These are synthetic public wire fixtures; they are not evidence of a 3.8.1 package or production runtime. Those synthetic fixtures alone did not establish formal package behavior; the subsequent real package integrations are recorded below.

The product changes only extend the accepted status enum, preserve the two known fallback lifecycles and label them `未完成`/`受阻`. They do not reconstruct times, change cost attribution, alter persistence or authorize a production read/deployment.

Formal package adoption is now verified by issue 298's real local Worker/PG/HTTP
fixture: ordinary and activated repairs have `complete` trace roots, exhausted
and genuine handoff cases retain `partial`, and public completion/read of a
blocked job retains `blocked`. Each terminal root records its real end; viewer
refresh and replay preserve the same native interval. See
[the sanitized 3.8.1 receipt](../issue-298/after-3.8.1.json). This remains local
controlled evidence, not acceptance or deployment of the original case.

That direct-reader/Worker proof did not cover terminal SSE. The consumer trace
fixture subsequently exposed 3.8.1's stale realtime phase mapping: partial and
blocked snapshots were rejected as null. Final adoption therefore requires the
formal 3.8.2 fix and a repeated native history/SSE/reconnect integration; see
[the separate failure receipt](../issue-298/sse-3.8.1.json).

Final formal 3.8.2 adoption passed the unchanged native PostgreSQL/Worker/SSE
consumer regression: live starts with no end, the same start with actual end
after completion, and identical history/terminal SSE beyond-last-event replay/
reload snapshots. Revoked and other-tenant access still fails. The five affected
integration files passed 8/8, separately from the six Worker scenarios and
blocked public reader. Package/lock integrity and native schema identity are
recorded in [the formal 3.8.2 receipt](../issue-298/formal-package-3.8.2.json).
No production deployment or original-case verification is claimed.
