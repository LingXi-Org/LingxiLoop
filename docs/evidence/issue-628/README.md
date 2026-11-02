# #628: Slides entry and native sidebar transitions

Base: `2b33a54c` (merged #629). No changes to the editor implementation, math,
export, server, credential/configuration, grants, origin checks or CSP. This work
does not deploy production; the parent thread's sole integrator owns release.

## Implementation and source

- `DesktopApp` mounts `SlidesSidebarLayout` for each Slides entry/project. Its
  existing shadcn `SidebarProvider` starts with `defaultOpen={false}`. This is
  the first-render state, with no delayed effect, timer, content-update reset or
  second collapse state. Page headers and the navigation header use
  `SidebarTrigger`. Leaving the module unmounts this provider; returning creates
  a fresh collapsed provider. Other modules retain their existing shell layout.
- Canvas's existing `design` surface controls the same Sidebar provider for
  desktop and mobile. `Sidebar side="right"` replaces instant `display:none`.
  Sidebar's width gap adjusts chat width as the native side-position transition
  moves the panel. Width drag and keyboard adjustment remain available.
- The Canvas Sidebar uses an opt-in retained, nonmodal Sheet content in place.
  At desktop sizes its animation is disabled and the Sidebar's native
  width/left/right transitions apply; on mobile the Sheet's native slide applies.
  The same iframe DOM survives both folding and crossing the 768px breakpoint.
  Narrow conversation containers (<720px) retain the existing overlay behavior.
  The editor's lifecycle, scoped key and lazy loading remain with #629's owners.
- Mobile navigation remains a native modal Sheet. Its controls restore focus;
  reopen during an exit does not let a stale close steal focus. Navigation
  content is layered above its exiting/reappearing overlay. Closed panels are
  inert. The retained desktop Canvas leaves Tab in the normal page order rather
  than inheriting Sheet's mobile focus loop. Reduced motion disables animations.
- Existing Sheet classes used `data-open`/`data-closed`, while Radix emits
  `data-state="open|closed"`. These now match the official registry, including
  native full left/right slide directions. This selector correction also affects
  other consumers of the shared Sheet; their content and state owners are unchanged.

Official MIT source verified at immutable shadcn-ui/ui commit
[`4aaea19d9cff3e0908e12a8c1d504b8c5ec34610`](https://github.com/shadcn-ui/ui/tree/4aaea19d9cff3e0908e12a8c1d504b8c5ec34610/apps/v4/registry/new-york-v4/ui):
`sidebar.tsx` (provider, gap, left/right position transitions) and `sheet.tsx`
(Radix state selectors and slide directions). Project tokens, icons and the
retained work-surface adaptation are local. No new animation library/keyframes,
parallel collapse store or change to the run's state was introduced.

## Reproduce

```sh
npm run dev -- --host 0.0.0.0
node docs/evidence/issue-628/check.mjs
```

The checker defaults to `/usr/bin/chromium` and the environment's existing
Playwright at `/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs`.
Override `BROWSER_EXECUTABLE`, `PLAYWRIGHT_MODULE`, `SIDEBAR_BASE_URL` or
`SIDEBAR_OUTPUT` if needed. Output defaults to `/tmp/628-evidence`.

The fixture renders real `SlidesSidebarLayout`, `SlidesPage`, `SlidesWorkspace`,
`ArtifactEditorFrame`, `DesignWorkspace`, Sidebar/Sheet and page-header components.
It uses synthetic public decks, a small local editable iframe and in-memory
service stubs. Chat workspace setup is deliberately pending so that loading the
editor still exercises #629's independent path. The fixture's chat textarea is
synthetic; it is not a full authenticated chat, editor or backend E2E.

## Observed checks (2026-11-02, Linux Chromium)

- `results.json` records the completed browser replay at 1400, 768, 390 and
  320px widths: collapsed initial entry, content updates preserving expansion,
  navigation away/back, reload, and a direct `?deck=deck` open/reload.
- Desktop left/right gap widths have intermediate values while closing;
  mobile sheets use the native `enter`/`exit` animation. Sidebar occupied width
  matches the released/used content width. No page horizontal overflow was found.
- Keyboard activation, Ctrl+B, Escape, close focus restoration, desktop Canvas
  Shift+Tab back to chat, width keyboard control and Canvas pointer dragging.
  Rapid navigation and Canvas reopen/close cycles settle to the requested state.
- Both editor hosts retain the same iframe and typed draft through folding and
  reopening. Slides library return/reopen retains its original iframe after the
  existing membership recheck. Canvas also retains the iframe/draft across both
  directions of the mobile breakpoint; the synthetic chat draft survives.
- Reduced motion: computed animation `none`, transition duration `0.00001s`
  under the application's existing reduced-motion rule. No browser page errors.
- Web test suite: 156/156 passing, including changed tests. Final focused checks
  (Slides sidebar, Canvas, artifact surface and reveal lifecycle): 7/7 passing.
  Lint and typecheck pass; lint retains the existing document.cookie warning in
  the official Sidebar provider. Web build passes with existing dependency/chunk
  warnings. CI status is reported on the draft PR.

The source regression initially failed against the old Canvas because it had no
Sidebar offcanvas state/gap. Browser additions also caught real issues with
external-trigger rapid mobile reopen, overlay ordering and keyboard focus; the
final replay covers those paths. Screenshots show the synthetic rendered surface,
not a production account or a visual-parity claim.

## Remaining verification

The integrator must independently review the final candidate and observe its CI
before merge. Production deployment, authenticated account flows, real editor
save/export, live IM/model responses, Safari and physical mobile/IME interaction
were not exercised here. #631 mathematics work is independent; this PR does not
modify Slides editor math/export modules.
