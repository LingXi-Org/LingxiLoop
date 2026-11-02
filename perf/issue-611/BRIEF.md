# Canvas and visualization resource performance (#611)

Initial baseline: `3cbc78d8a41509541701320449a12fdfb2d379b9`, SDK 3.8.21 lock.
Final paired baseline includes #615 at `a2ec76b2316f5f5afbea8453507c88881c3fc70b`;
both arms retain identical math functionality. See README.md for environment limits.
Owner: this isolated task; #612 owns container sizing and #613 owns math parsing,
rendering and font readiness. Merge/deploy belongs to the parent integrator.

Goal: minimize measured time from opening a saved canvas/interactive view to real
content and a working control. No theoretical-optimality claim. Keep all content,
editing, background changes, cancellation, retry, grant authorization and iframe
isolation. Do not prefetch unbounded documents or keep unbounded frames.

Protocol: Chromium on this cloud CPU, viewport 1440×1000 and 768×1000. Fast 4G
(20 ms latency, 4 Mbps download, 3 Mbps upload), CPU 1× and diagnostic 4×.
Throttle parent and OOPIF targets. Fresh contexts for cold, same context new
document for warm cache and refresh, same mounted component for reopen. At least
10 runs per final group, interleave A/B. Report p50/p75/p95, transfer bytes,
requests, resource timing, long tasks and CPU/heap diagnostics. Keep raw samples.

Fixture uses production DesignWorkspace/ArtifactEditorFrame, the pinned canvas
editor with the explicit build adaptations, and production GenUI host/guest. Deterministic local HTTP supplies
synthetic public documents and scoped API replies. It measures resource and
browser work, not production database, authentication, IM or model latency.
Real grant/ACL coverage remains a separate integration check. No browser or data
on the Lenovo computer is touched.

Visible = authored heading painted in a rendered board/guest; usable = actual
trusted click/double-click followed by an observed edit/control result. Loading
text or SDK ready alone is not usable. Retained reopen must reuse the iframe and
preserve an edit. Refresh must recover saved content; another scope must not.

Rollback: revert this task's commits and rebuild the compatible application/SDK 3.8.21
release. No migration, durable data deletion or credential change is planned.
