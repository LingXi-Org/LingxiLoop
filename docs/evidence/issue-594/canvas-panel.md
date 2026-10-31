# Canvas conversation panel — #594

Base: `5014f87a` (main, SDK lock 3.8.19/native14/product60).

## Ownership and behavior

- The production main Canvas owner was `DesktopApp.tsx`: desktop Dialog and mobile Drawer. `ChatPane.tsx` now owns a scoped `DesignWorkspace`; member/thread/document drawers and auxiliary editor dialogs remain with their existing owners.
- Desktop uses the existing `react-resizable-panels` primitives. Below 720px of available chat workspace width, the same editor becomes a right-side, full-width nonmodal panel. There is no backdrop, modal focus lock, animation, or body scroll lock.
- Closing hides the retained editor with CSS plus `inert`/`aria-hidden`; it does not call any artifact mutation or run cancellation. Reopening the same artifact retains its iframe. The common mobile/desktop ChatPane tree also avoids replacing the iframe at the shell's 768px breakpoint.
- Account/company/project/conversation changes key a new workspace and discard the previous editor. The existing surface store closes Canvas on conversation/view navigation. Late ensure responses check all four scope values before opening.
- The host region takes focus on opening; host Escape and its close button close the panel and restore its opener. Native Tab traversal remains available. Editor rendering, zoom, save, comments and live transport are reused without protocol changes.

## Checks

- Seven new focused regressions passed: nonmodal/interactive chat markup, inaccessible closed surface, late responses across four scopes, accepted current-scope opens, conversation navigation, close/reopen identity, mobile list/view navigation. `CI_TEST_FILES='["src/features/design/DesignWorkspace.test.tsx","src/features/design/open-design.test.ts","src/features/design/navigation.test.ts"]' npm test` passed 144/144 tests.
- Existing `artifact-app-boundary.test.ts` retains all original tests and adds reopen checks for saved file contents and the existing waiting creative assignment. It also retains its real HTTP/DB/Redis grant, authorization, realtime and save-conflict coverage.
- `npm run lint`: passed with existing repository warnings; focused lint on all modified TypeScript files: no diagnostics.
- `npm run build`: passed locally, including visualize verification and typecheck. The preinstalled local SDK was discovered to be 3.8.16 despite the lockfile's 3.8.19; exact locked-package checks must therefore be taken from CI.
- Local integration setup is blocked: bootstrap first refused unsupported local port 55432; after using supported port 15432, the preinstalled 3.8.16 runtime failed the formal retirement guard. Both package metadata and the exact locked 3.8.19 tarball returned HTTP 401 from GitHub Packages. No credentials or dependency lockfiles were changed. Selected integration CI has not run because PR creation was denied.

## Submission blocker

Implementation commit `391d2e7d982304c77f91f4dac7a2ee69b9577356` was pushed to `fix/594-canvas-side-panel`. The GitHub connector rejected creation of a draft PR targeting `LingXi-Org/LingxiLoop:main`: its automatic approval reviewer did not recognize trusted user authorization for this repository, branch and #594 submission. No PR was created; the operation was not retried through another tool. The parent must provide the relevant trusted authorization before a single retry. PR CI and independent review remain pending.

## Unverified boundary

Browser acceptance was explicitly waived for this task. No desktop/narrow before/after screenshots, real keyboard/iframe focus traversal, drag/zoom/resize, visual clipping/contrast, physical IME, live production Canvas or real model creative delivery were measured. Source/SSR regressions do not establish those observations. Independent review belongs to the designated parent integrator before merge.

Delivery is limited to a draft PR once authorized: no merge, deployment, SDK release, issue closure, product migration or production data deletion occurred.
