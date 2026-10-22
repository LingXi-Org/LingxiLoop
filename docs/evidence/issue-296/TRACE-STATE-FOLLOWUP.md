# Trace terminal-state follow-up for runtime 3.8.1

Failure boundaries: a known `partial` or `blocked` lifecycle must not become `unknown`, `complete` or a running clock; the actual execution interval must remain unchanged. A genuinely unknown state must stay unknown. A fallback without a recorded execution interval must retain null endpoints.

This additive product patch is for issue 298's formal runtime 3.8.1 upgrade. It must not be released independently against 3.8.0, whose public trace reader still folds these two states into unknown.

Tests were written first. The two render cases initially failed because the status labels were absent. Additional fallback assertions initially failed because an unresolved tool inherited the run's outcome. The patch preserves that tool's unknown outcome while keeping the known root state. DTO/fallback/render regressions then passed 4/4, and adjacent trace regressions passed 27/27. These are synthetic public wire fixtures; they are not evidence of a 3.8.1 package or production runtime. The owning 3.8.1 integration must verify actual `partial`/`blocked` trace states and recorded completion times after the formal package is available.

The product changes only extend the accepted status enum, preserve the two known fallback lifecycles and label them `未完成`/`受阻`. They do not reconstruct times, change cost attribution, alter persistence or authorize a production read/deployment.
