---
name: lingxiloop-resource-loading
description: "Implement, refactor, debug, or review any LingxiLoop resource UI, page-like destination, or focused creation/editing flow, including documents, boards, cards, calendar events, Canvas workspaces, knowledge sources, attachments, media, link previews, email content, people, courses, lists, viewers, detail panels, dialogs, and loading states. Use whenever adding or changing these surfaces so navigation uses the appropriate shared Base UI Drawer or Dialog and every pending path has a layout-preserving Skeleton placeholder."
---

# Build LingxiLoop Resource Loading States

Treat a resource loading state as part of the feature contract, not optional polish.

## Preserve the two-column IM shell

- Keep the authenticated desktop application permanently limited to two columns: conversation list and active conversation.
- Open browse, detail, inspection, and large workspace destinations above that shell with the shared shadcn `Drawer` from `@/components/ui/drawer`, backed by Base UI.
- Use the Base UI API from the installed component: `swipeDirection` for placement and `render` for `DrawerTrigger` and `DrawerClose` composition. Do not introduce Vaul compatibility props such as `direction` or `asChild`.
- Treat Canvas, knowledge/library content, documents, boards, calendar, settings, learning, management, participant profiles, threads, citations, and artifact details as Drawer content. They must not replace the conversation column, navigate to a new application page, open a new browser window, or create a third column/right rail.
- Include `DrawerTitle` and `DrawerDescription`, provide an accessible close control, preserve focus restoration, and make the Drawer body the scroll container with `min-h-0 flex-1 overflow-y-auto` when scrolling is required.
- Do not substitute `Sheet`, ordinary `Dialog`, a permanently mounted sidebar, a resizable detail panel, or CSS-hidden legacy rail for a page-level Drawer.
- When migrating an existing surface, remove its old page/rail/sidebar host, resize state, navigation branch, compatibility adapter, and unreachable launcher code instead of merely hiding it.
- Keep transient controls such as menus and tooltips in their appropriate primitives. Do not turn every overlay into a Drawer.

## Choose Drawer, Dialog, or Alert Dialog by intent

- Use the shared shadcn `Dialog` from `@/components/ui/dialog`, backed by Base UI, for focused creation and editing workflows that should keep the user's attention in a bounded form. Creating a group chat is a required Dialog use case; member selection, naming, and submission belong in one Dialog rather than a Drawer or new page.
- Prefer Dialog for short or medium forms, pickers, configuration steps, and tasks with a clear submit/cancel outcome. Include `DialogTitle` and `DialogDescription`; use `DialogFooter` when the action row should stay distinct or sticky.
- Use Drawer for browsing, reading, inspecting, or navigating content that benefits from substantial height/width, continued chat context, or nested detail exploration, such as Canvas, documents, boards, calendars, settings, profiles, threads, citations, and resource details.
- Use the shared Base UI Alert Dialog only for destructive, irreversible, privileged, or approval-gated confirmation, following `$lingxiloop-sensitive-interactions`. Never use an ordinary Dialog or Drawer as a sensitive confirmation substitute.
- Use the installed Base UI composition APIs. For Dialog and Drawer triggers/close controls, use `render`; for Drawer placement, use `swipeDirection`. Do not add Radix or Vaul compatibility props or adapters.
- Do not open a new application page or browser window when the content fits one of these overlay intents. Choose the primitive from user intent and interaction scope, not from a blanket preference for Drawer.

## Keep implementation commentary out of the product UI

- Render only copy that helps an end user understand their content, available action, current product state, or actionable error.
- Never render developer-facing annotations, implementation explanations, architecture notes, compatibility notes, debugging output, diagnostic identifiers, internal state names, test instructions, mock/dev labels, component or library names, or commentary explaining why the interface is structured a certain way.
- Do not expose layout invariants or navigation implementation details in subtitles, helper text, empty states, tooltips, banners, Toasts, accessibility descriptions, or error messages. For example, never tell users that closing a Drawer preserves a two-column layout.
- Keep required accessible names concise and user-facing. When a component contract requires a description but no useful visible description exists, provide a meaningful `sr-only` description instead of visible implementation commentary.
- Treat temporary debug copy as prohibited production UI. Inspect the rendered path and remove it before considering the frontend change complete; do not merely hide it at a breakpoint.

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
- the desktop shell contains exactly the conversation-list and conversation panels;
- page-like destinations compose the shared Drawer and do not add a third panel, right rail, or synthetic navigation layer.

Run the checks selected by `$lingxiloop-verify-change`, plus the owning frontend test and a browser check of at least one initial-load transition.
