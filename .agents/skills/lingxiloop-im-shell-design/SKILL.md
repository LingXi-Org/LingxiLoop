---
name: lingxiloop-im-shell-design
description: "Implement or review the LingxiLoop desktop IM shell: workspace rail, workspace strip, conversation sidebar/list, conversation header, shared inset panel, resize divider, and account footer. Do not use for message bubbles, transcript content, Composer, attachments, or other in-conversation content styling."
---

# LingxiLoop IM Shell Design

Use this skill for changes to the desktop application's navigation and conversation shell. Preserve the product's light, low-density Luma/Mist hierarchy without turning it into a dense Discord clone.

## Scope boundary

This skill owns only:

- the workspace/project rail;
- the centered current-workspace strip above the main panel;
- the shared inset panel containing the conversation list and conversation area;
- conversation search chrome and the flat conversation list;
- the minimal current-conversation header;
- the resize divider between list and conversation area;
- the account/avatar footer attached to the conversation list.

This skill does **not** own `MessageList`, message rows, message bubbles, reactions, tool cards, attachments, activity content, empty conversation content, or Composer. Do not preserve, normalize, or redesign those surfaces merely because they render inside the main panel. A shell task does not authorize edits to them.

## Preset contract

`--preset b3bZWXGcRE` is the design source. Its current resolved configuration is:

- shadcn style: `base-luma`;
- base color: `mist`;
- CSS-variable theming;
- icon library: `hugeicons`;
- menu color: `default`;
- menu accent: `subtle`.

Never infer this contract from the preset name or from memory. Before changing shell tokens or regenerating primitives, inspect these sources in order:

1. `components.json` — installed preset configuration, aliases, icon library, and theme CSS entrypoint.
2. `src/styles/globals.css` — actual light and dark token values. Search for `--background`, `--card`, `--accent`, `--border`, `--ring`, `--sidebar-*`, `--radius`, and the `.desktop-openmaus` aliases.
3. `src/components/ui/sidebar.tsx` — installed shadcn Sidebar behavior. `SidebarInset` is the reference for inset panel radius, margins, and `shadow-sm`; floating Sidebar is the reference only when a true floating Sidebar is requested.
4. `src/components/ui/item.tsx`, `input-group.tsx`, `avatar.tsx`, `button.tsx`, and `resizable.tsx` — primitive styling and supported variants. Compose these primitives instead of recreating them.
5. Shell owners: `src/desktop/DesktopApp.tsx`, `src/desktop/ServerRail.tsx`, `src/features/conversations/components/ConversationsPane.tsx`, `src/im/ConversationList.tsx`, `src/im/ConversationHeader.tsx`, and `src/components/nav-user.tsx`.
6. `src/styles/chat.css` and the `.desktop-openmaus` section of `src/styles/globals.css` — shell-only semantic aliases and divider behavior. Do not treat unrelated transcript CSS in these files as part of this skill.

If the user asks to re-resolve the preset, generate a disposable project in a verified system temporary directory with `npx shadcn@latest create --preset b3bZWXGcRE --template vite`; inspect its `components.json` and theme CSS, then remove only that verified temporary directory. Never run preset initialization over the working project merely to inspect it.

## Surface hierarchy

The desktop shell has three visual levels:

1. **Page/navigation base:** use `accent` and `accent-foreground`. The outer page, ServerRail, and current-workspace strip are one continuous Mist-colored base. Do not substitute `sidebar`, a hard-coded gray, or a custom mix for this page layer.
2. **Shared inset main panel:** use `card` and `card-foreground`, `rounded-2xl`, and the preset's `shadow-sm`. The conversation list and conversation area are physical partitions of this one panel, not separate floating cards.
3. **Subtle interaction states:** use `sidebar-accent`, `muted`, `input`, `ring`, and their paired foreground tokens according to the installed primitive. Do not invent parallel colors.

Never hard-code light colors such as white, stone, slate, or gray for these shell surfaces. Preserve the dark token path even when the requested screenshot is light mode.

## Desktop layout baseline

- ServerRail is an independent fixed `w-16` column. It is not part of the white/card inset panel and has no vertical border against the page.
- The current-workspace strip above the main panel is `h-5`, centered in the available content width, and intentionally very compact. Its workspace mark is `size-3`; its label is 11px with tight line height.
- The inset main panel leaves the preset-colored page visible at its end and bottom (`me-2 mb-2`), clips its children, and uses `rounded-2xl bg-card text-card-foreground shadow-sm`.
- The conversation column defaults to 25%. Keep its practical resize range at 280–420px unless the user explicitly changes density. The conversation area must retain at least 320px.
- The list and conversation area share the same `card` surface. The resize divider supplies the physical partition; do not wrap either side in another floating card.
- The resize bar uses `--im-divider`; its visible handle remains hidden until hover, active, or keyboard focus.

## Workspace rail

- Keep the product Logo visually separate from workspace switching.
- The only canonical static product artwork is `assets/lingxiloop-logo.svg`. Web, website, PWA, Electron, Dock/taskbar, and tray assets must be generated from it; do not add a parallel Logo source or restore the retired layered icon sources.
- The rail Logo uses `src/components/BrandAvatar.tsx` with `src/assets/lingxiloop.avatar.json`; never replace it with a letter, static fallback mark, workspace Avatar, or unrelated icon.
- The dynamic rail Avatar keeps the canonical SVG frame behind every expression: the 135° `#e0ffe2` → `#ebffc7` gradient, 18% corner radius, and clipped overflow. Do not render the procedural body on a transparent rail background.
- Preserve the brand interaction contract: `brand-idle` keeps `upward-side-glance` and lets the avatar runtime own its randomized 3.4–6.2s blink timeline, `brand-squint` reaches `sleepy-squint` through a 160ms smooth response and holds it for 700ms, and four clicks within 1.5s hold `angry-brows` for 2.5s. Enter idle and angry through 420ms `smooth` timeline steps so every change interpolates from the currently painted frame. During the angry interval, play `brand-angry-shake` so the runtime continuously renders the expression's source `motion.body: shake`, then amplify only the inner SVG with `brand-avatar.css` while keeping the gradient frame stationary and honoring `prefers-reduced-motion`. The brand reaction must not prevent the existing dashboard action.
- Repeated clicks while `sleepy-squint` is already visible only extend its hold timer. Do not re-emit the same expression or transition through `upward-side-glance`, because that creates an idle flash between closed-eye holds.
- The rail starts at the established desktop titlebar offset (`pt-[26px]`). The Logo is `size-9`; the Logo-to-workspace divider is a full-width 1px line using `--im-divider`.
- The divider position is a shared alignment datum with the top chrome. If Logo size, top offset, or header height changes, recompute the line rather than nudging elements independently.
- Workspace rows use an 11px-high interaction lane (`h-11`) with a `size-9` workspace mark. The mark is centered with the existing one-pixel optical adjustment.
- Preserve the active green leading bar and ring, and the unread green dot/short marker. Use logical `start`/`end` positioning.
- Subsequent workspaces and the add action form one compact but readable vertical sequence. Do not collapse targets until avatars touch, and do not restore Discord-like high density.
- Use tooltips for icon-only workspace actions. New shell icons must follow the configured Hugeicons system; do not introduce another icon family.

## Conversation sidebar and list

- The search header is `h-12`; its `InputGroup` is `h-8`, `rounded-xl`, `bg-input/50`, border-transparent, and shadowless.
- There is no decorative divider between search and the first conversation. Use spacing, not a line, to group them.
- Use shadcn `ItemGroup` and `Item` for conversation rows. Never replace rows with Button-based handwritten list components.
- The list is classic flat: `ItemGroup` gap 0; rows have no border or shadow, transparent default background, and subtle token hover/selected backgrounds.
- Desktop rows remain compact while keeping the established large Telegram-like identity scale: 48px conversation avatar, 15px title, 13px preview, and approximately 60px virtualized row height.
- Selected rows use `sidebar-accent/sidebar-accent-foreground`; unselected rows use the normal shell foreground and the same subtle accent on hover.
- Do not render a `Direct` section label or per-row bottom-right status dots. Preserve unread meaning without reintroducing removed status-dot code.
- The first visible conversation and first workspace should read as corresponding rows. When changing header height, rail gaps, row height, or list padding, inspect both columns together and restore optical center alignment.

## Conversation header

- Use the simplest classic shadcn header: desktop `h-12`, `bg-card`, token foreground, and only the selected conversation's real Avatar plus name.
- Desktop Avatar is 30px; the name is `text-sm font-medium`. Keep this as one leading information group.
- Do not add an avatar button frame, stacked metadata, topic, leader selector, presence copy, search button, Canvas button, or right-side action cluster unless the user explicitly requests one.
- The required bottom separator uses `--im-divider-weak`. Ensure no higher-specificity CSS overrides it back to full `border`.
- Mobile may retain a shadcn ghost back button and safe-area padding, but should otherwise show the same Avatar/name hierarchy.

## Footer and boundaries

- The account footer belongs to the conversation column and uses `bg-card`, `p-2`, and a top border with `--im-divider-weak`.
- Use the existing `NavUser` shadcn dropdown composition; do not handwrite account menus.
- Prefer no boundary where a shared background and spacing already express grouping. Necessary structural separators use only `--im-divider` or `--im-divider-weak`.
- Do not use arbitrary opacity utilities for a separator that must match another separator. Reference the same semantic variable on every segment.
- Do not add custom panel shadows. For this inset panel, the preset contract is `shadow-sm` with no extra ring. A ring belongs to the true floating Sidebar variant, not this shared inset panel.

## Implementation rules

- Use installed shadcn primitives and their variants. Do not create handwritten substitutes for Button, Avatar, Item/ItemGroup, InputGroup, Tooltip, DropdownMenu, or Resizable controls.
- Use preset tokens through Tailwind semantic classes or CSS variables. Do not duplicate OKLCH values in component class names.
- Preserve the layout/content boundary: changing shell colors must not cascade into message bubbles or Composer. Scope shell aliases under `.desktop-openmaus` and target named shell classes when necessary.
- Preserve Electron drag/no-drag regions and safe-area behavior when editing top chrome.
- Preserve existing user changes outside the shell and do not regenerate installed primitives unless the user explicitly asks.

## Verification

Before handing off a shell change:

- inspect the actual diff for accidental edits to message or Composer files;
- confirm the outer base resolves to `accent`, the inset panel resolves to `card`, and no hard-coded gray/white was introduced;
- confirm `components.json` still matches `base-luma`, `mist`, `hugeicons`, and `subtle`;
- check narrow and wide desktop widths, the 280px and 420px conversation-column bounds, dark mode, and keyboard focus on the resize handle;
- verify the Logo/divider, search/header, first workspace, and first conversation as one alignment system;
- run `npm run guard:brand` after changing any Logo, icon, favicon, avatar definition, workspace-rail brand interaction, or brand generation script;
- run the repository's changed-file lint and the verification checks selected by `lingxiloop-verify-change`.
