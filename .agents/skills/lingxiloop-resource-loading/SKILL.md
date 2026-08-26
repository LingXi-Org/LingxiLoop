---
name: lingxiloop-resource-loading
description: "Implement, refactor, debug, or review any LingxiLoop UI that loads resources asynchronously, including documents, boards, cards, calendar events, Canvas workspaces, knowledge sources, attachments, media, link previews, email content, people, courses, and resource tables. Use whenever adding or changing a resource list, card, preview, viewer, detail panel, picker, or loading state so every pending path has a layout-preserving Skeleton placeholder."
---

# Build LingxiLoop Resource Loading States

Treat a resource loading state as part of the feature contract, not optional polish.

## Required implementation

- Import `Skeleton` from `@/components/ui/skeleton`; never recreate pulse color, animation, or base radius in business components.
- Prefer `ResourceSkeleton` from `@/components/ResourceSkeleton` for list, cards, detail, media, and table surfaces.
- Render a skeleton whenever a resource request is pending and usable cached content is absent. Keep cached content visible during background refresh unless stale data would be unsafe.
- Match the loaded layout's width, height, density, and responsive breakpoints closely enough to prevent layout shift.
- Cover desktop, mobile, peek/sheet/dialog, empty initial load, pagination, and lazy media paths that the resource supports.
- Keep loading, empty, error, and ready states mutually exclusive. Never show an empty-state call to action while the first request is pending.
- Expose `role="status"` or an equivalent accessible busy contract with concise localized text; keep skeleton geometry non-interactive.
- Preserve existing stores, APIs, retries, focus behavior, and resource protocol boundaries.

Do not return `null`, plain “加载中…” text, a spinner alone, or an em dash for an initial resource load when the final layout can be represented by a Skeleton.

## Review existing resources

When touching an existing resource surface, trace all request flags and cached-data branches. Replace uncovered initial-load gaps in the owning surface within the requested scope. For inline or virtualized content, reserve a stable bounded footprint so the placeholder does not cause transcript or list jump.

## Verify

Add or update the narrowest structural or behavioral test that proves:

- the official `data-slot="skeleton"` primitive remains intact;
- each changed resource pending branch renders `ResourceSkeleton` or `Skeleton`;
- loading is not confused with empty or error state;
- responsive and overlay variants retain stable geometry.

Run the checks selected by `$lingxiloop-verify-change`, plus the owning frontend test and a browser check of at least one initial-load transition.
