# #662 integration with the merged Mingli interface

The user requested resolving #662 conflicts and releasing the existing work,
without starting further issues. Additional frame/cold-start investigation was
paused; its uncommitted experiments are excluded. Production remains with the
parent thread’s designated sole integrator, per AGENTS.md.

## Conflict and smallest correction

Integrated main `50a6e1c6` (#664 and its build fix). DesktopApp was the only
conflicted file. Preserve main's 280px default, collapse/expand button, design
surface auto-collapse, hidden/inert semantics, and double-click reset. The native
Panel ref returned by `useSidebarWidth` now also drives those existing imperative
operations; no duplicate ref or new resize controller is introduced.

A concrete compatibility regression was reproduced before the correction using
the installed native Panel/Separator: drag 300→340, press Enter to collapse;
previous hook persisted 260 rather than retaining 340. See
`evidence/integration/collapse-before.txt`. Ignore zero-width commits so collapse
preserves the expanded preference. Reset uses the same native ref, cancels any
pending user-save frame, restores 280, and explicitly persists 280. Main's
existing storage key and 260–360 bounds remain unchanged.

## Reproduction and validation

```sh
node --import tsx --test src/desktop/useSidebarWidth.test.tsx
node perf/issue-660/workspace/build.mjs . .codex-tmp/issue-660/merge-host
python -m http.server 4488 --bind 127.0.0.1 --directory .codex-tmp/issue-660/merge-host
python perf/issue-660/workspace/persistence.py 4488 perf/issue-660/evidence/integration
python perf/issue-660/workspace/collapse.py 4488 perf/issue-660/evidence/integration
CI_TEST_FILES='["src/desktop/useSidebarWidth.test.tsx"]' npm test
npm run lint
npm run build
```

The browser tests exercise the actual native library and owning hook, using
public fixture content and ephemeral Chromium, rather than production login.
They verify no writes during movement, one settled save, keyboard and reload,
container resize not persisting, malformed/denied storage, Enter collapse/expand
retaining the saved width, and double-click restoring 280 across reload.
All listed local checks passed: 171 Web tests including four owning tests,
lint (46 existing warnings, two infos), typecheck, production build including
the native editor prebuild, and both browser regressions with zero page errors.
`evidence/integration/checks.json` records the local result.
This is targeted native integration coverage, not full production authentication,
real IM, database authorization or complete #663 visual requalification.

## Preserved performance limits

All Phase 2 raw measurements remain attributed to their recorded source/builds,
including the earlier 300px native-panel default; they were not rerun or renamed
as measurements of this conflict resolution. That work reduced median style
cost by 69–87% but retained a >100ms frame. Cold p75 Design 4971.8ms versus
4945.8ms control, Slides 4803.3ms versus 4689.3ms control: the 50% cold goal is
unmet. Complete offcanvas native Resizable composition, stall-free production
acceptance, and live IM/ACL stress coverage remain unqualified. No such claim is
required or introduced by this release. Issue #660 remains open.

Final frozen-head independent review, PR checks, merge SHA and successful deploy
job/public probes must be recorded by the sole integrator. A green older-head
run or a successful branch push is not proof of a production deployment.
