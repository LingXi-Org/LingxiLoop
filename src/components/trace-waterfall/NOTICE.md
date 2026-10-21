This directory adapts the MIT core TimelineRowMetrics component and the bar-row
presentation from Langfuse, after inspecting the actual public demo in light/dark
and tree/timeline states (screenshots in docs/evidence/issue-283-trace/candidates).

Pinned source: langfuse/langfuse 4a8541413b2b2cda7f368215f1c26fc62bfb4bc5
- web/src/features/traces/components/TraceTimelineDense/TimelineRowMetrics.tsx
- web/src/features/traces/components/TraceTimelineDense/TimelineDense.tsx (bar row)
https://github.com/langfuse/langfuse/tree/4a8541413b2b2cda7f368215f1c26fc62bfb4bc5/web/src/features/traces/components/TraceTimelineDense

Copyright (c) 2023-2026 ClickHouse, Inc. MIT Expat, full notice in LICENSE.
No ee/ files or enterprise modules are used. No Langfuse backend/data ingestion,
SDK, external service, prompt panel or raw/hidden-reasoning renderer is imported.

Changes: reduced component types, fixed duration/cost column instead of labels on thin bars,
shared axis/row geometry, descendant-domain headroom, product semantic colors, nullable relative time,
React tree and safe-details shell, keyboard controls, clock and reduced-motion
transitions. The local shell/data adapter were independently implemented. No claim
of pixel-identical/full Langfuse or affectUI functionality. No paid source/assets.
