---
name: lingxiloop-resource-loading
description: "Implement, refactor, debug, or review any LingxiLoop resource UI, page-like destination, or focused creation/editing flow, including documents, boards, cards, calendar events, Canvas workspaces, knowledge sources, attachments, media, link previews, email content, people, courses, lists, viewers, detail panels, dialogs, and loading states. Use whenever adding or changing these surfaces so navigation uses the established page, Drawer, or Dialog host and every pending path has a layout-preserving Skeleton placeholder."
---

# Build LingxiLoop Resource Loading States

Treat a resource loading state as part of the feature contract, not optional polish.

## Choose the page host by navigation intent

- Preserve the conversation list and active conversation when the user remains in the IM workspace; do not add a permanent third column or right rail there.
- Use the established Dashboard page for top-level browsing and management destinations such as learning, knowledge libraries, calendars, settings, and multi-workspace resource views.
- Use the shared shadcn `Drawer` when a browse or detail surface is intentionally overlaid above the current page and continued context matters.
- When a Drawer is selected, include `DrawerTitle` and `DrawerDescription`, provide an accessible close control, preserve focus restoration, and make the body the scroll container with `min-h-0 flex-1 overflow-y-auto` when scrolling is required.
- Keep transient controls such as menus and tooltips in their appropriate primitives. Do not turn every destination or overlay into a Drawer.
- When migrating an existing surface, remove its superseded host, resize state, navigation branch, compatibility adapter, and unreachable launcher code instead of merely hiding it.

## Choose Page, Drawer, Dialog, or Alert Dialog by intent

- Use the shared shadcn `Dialog` from `@/components/ui/dialog` for focused creation and editing workflows that should keep the user's attention in a bounded form. Creating a group chat is a required Dialog use case; member selection, naming, and submission belong in one Dialog rather than a browsing page.
- Prefer Dialog for short or medium forms, pickers, configuration steps, and tasks with a clear submit/cancel outcome. Include `DialogTitle` and `DialogDescription`; use `DialogFooter` when the action row should stay distinct or sticky.
- Prefer a Dashboard page for top-level collections, multi-workspace navigation, and sustained management tasks. Prefer Drawer for contextual inspection that should not replace the current page.
- Use the shared Base UI Alert Dialog only for destructive, irreversible, privileged, or approval-gated confirmation, following `$lingxiloop-sensitive-interactions`. Never use an ordinary Dialog or Drawer as a sensitive confirmation substitute.
- Use the composition API exposed by the installed shared component instead of adding compatibility adapters.
- Choose the host from user intent, information architecture, and interaction scope; there is no blanket preference for Drawer.

## Keep implementation commentary out of the product UI

- Render only copy that helps an end user understand their content, available action, current product state, or actionable error.
- Never render developer-facing annotations, implementation explanations, architecture notes, compatibility notes, debugging output, diagnostic identifiers, internal state names, test instructions, mock/dev labels, component or library names, or commentary explaining why the interface is structured a certain way.
- Do not expose layout invariants or navigation implementation details in subtitles, helper text, empty states, tooltips, banners, Toasts, accessibility descriptions, or error messages.
- Keep required accessible names concise and user-facing. When a component contract requires a description but no useful visible description exists, provide a meaningful `sr-only` description instead of visible implementation commentary.
- Treat temporary debug copy as prohibited production UI. Inspect the rendered path and remove it before considering the frontend change complete; do not merely hide it at a breakpoint.

## Required implementation

- Import `Skeleton` from `@/components/ui/skeleton`; never recreate pulse color, animation, or base radius in business components.
- Prefer `ResourceSkeleton` from `@/components/ResourceSkeleton` for list, cards, detail, media, and table surfaces.
- Render a skeleton whenever a resource request is pending and usable cached content is absent. Keep cached content visible during background refresh unless stale data would be unsafe.
- Match the loaded layout's width, height, density, and responsive breakpoints closely enough to prevent layout shift.
- Cover Web, Electron, peek/sheet/dialog, empty initial load, pagination, and lazy media paths that the resource supports.
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
- the IM workspace does not gain a permanent third panel or right rail;
- page-like destinations use their established Dashboard, Drawer, or Dialog host without parallel navigation layers.

Run the checks selected by `$lingxiloop-verify-change`, plus the owning frontend test and a browser check of at least one initial-load transition.
