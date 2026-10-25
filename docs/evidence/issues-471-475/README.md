# Scrollbar stability and local editor focus (#471 / #475)

Baseline: `06e4a364f1355ae2c6bc027f84aa8674b88c6e4e`.
Scope: `globals.css`, `cases.css` and two noninteractive labels in `CasesPage.tsx`.

The desktop `data-ui-page` shell clips overflow; it is not the scrolling owner.
Forum `[data-forum-scroll]`, materials `[data-course-materials]`, dashboard lists,
scrolling Dialog content and preview inner panels use `overflow-y-auto`.
Extending that existing Tailwind utility with `scrollbar-gutter: stable` reserves
space at those actual hosts, including generated responsive variants. Cases has
its own CSS overflow rule and receives the same property. The shell/body receives
no gutter; horizontal-only code/table scrollers retain their existing behavior.
Single-edge `stable` keeps each page's children in one content box without adding
an opposite empty edge. Native overlay scrollbar behavior is retained.

Radix Dialog/Popover and Vaul retain their native scroll lock/focus behavior.
Their installed scrollbar compensation measures the document viewport, while
this desktop body is already `overflow: hidden`; inner page gutters remain in
place when the modal locks the body. No custom locking or scroll position reset
is introduced.

The case editor's existing focus-visible rule explicitly paints
`box-shadow: -2px 0 0 var(--ring)` over the full editor height. It is replaced by
an outline around a short summary/body label while the actual editable node
matches `:focus-visible`. Labels remain visible while scrolling their editor.
Native textbox roles/labels, BlockNote controls and block selection are retained.
Case editor widths shrink with the existing layout; long code scrolls locally.

## Executed

- Web build, including TypeScript checks, passed.
- Changed TSX lint and diff checks passed.
- Five emitted-CSS assertions passed: native overflow retained, stable gutters
  shipped for the utility and case page, long editor shadow removed, local
  focus-visible outline shipped. See [receipt](checks.json).

## Browser boundary / remaining acceptance

The installed Chromium SUID helper is owned by `nobody:nogroup`, mode4755.
No normal-sandbox browser was launched and no security settings were changed.
Computed DOM geometry, screenshots and visual root-cause confirmation are **not
verified**. This is an environment blocker, not an approval denial.

In a valid browser, compare title/container left edges (target delta <=1px) for
0/1/100 rows in forum, cases and materials; toggle tabs and open/close a material
preview, Dialog/Drawer/Popover. Confirm one vertical page host, scrolling/focus
and no horizontal overflow. In case editing, Tab/click empty, long Markdown/code
and reopened saved content; check the short focus label at mobile width and in
dark mode, then save/preview. These remain manual acceptance steps, not claimed
passes. No heavier CI matrix or independent review was added.

The page-header work for #470, mail workflow, LingxiOS, API and production were
not modified. Merge/release belongs to the designated sole integrator.
