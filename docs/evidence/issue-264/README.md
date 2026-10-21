# Issue 264: measured sliding-window ranges

Base: main `c66e847d14f838e72d0ab19e252e6cd4e2b68a76`, fetched 2026-10-21.
That main records production `b47723d8948708cd9b1ab230776e053d4b034c5c`,
runtime 3.6.0/native14/product50. No live deployment was performed here.

The private screenshot was inspected locally and is **not** in this directory,
issue or PR. All committed images and rectangle samples are synthetic fixtures.

## Established and unresolved causes

The screenshot shows an internal packet-state/outline mismatch: white 0–3 and a
base 0–3 label but an outline extending over 4/part of 5. Static numeric chart and
vertical sequence tools do not implement this interaction; arbitrary HTML save
checks neither its state-to-layout relationship nor browser geometry. This is
separate from the retained outer frame's CSS zoom correction.

The synthetic red case demonstrates nominal `4 * 72 + 3 * 8` width arithmetic
against eight flex-shrunk packets in 360px. It is **not** a reconstruction of the
original generated source. Without the authorized original, its unique root
cause remains undetermined and its saved HTML remains untouched. Original-source
access/targeted repair is pending; do not mark the user's existing component fixed.

## Change and minimal evidence

The explicit reusable `bindRangeOverlay` uses the selected element rectangle
union and a probe in the same containing block, including actual scroll, border
and scale. It remeasures after state changes, observed layout mutations/resize,
window resize/scroll and font readiness. Empty selection hides the outline.
The supported `visualize.sliding_window` action derives packet states, label and
selection from one state and saves/verifies through the usual authorized path.
Only explicitly selected fragments embed the helper. No host/source/global
rewrite, data migration, credential change or production document edit occurs.

Official `@e2e-dev/web` browser run `01a15c5a-9ae8-7fe4-82cf-9dbf9b04d82f`:
**1 passed**, 79.74 seconds; local Chromium 153, ordinary headless launch.
`geometry.json` records 15 passing state/layout comparisons plus the synthetic
red sample. Maximum edge error **0.0265655517578125 CSS px** (<1px tolerance).
Coverage: sizes 2/4/6, send/ack, autoplay/pause/reset, clipped 16–17 tail, complete
state hides outline/disables controls, 1440→760 resize, fractional gaps/borders,
internal scroll, scale .85 + zoom 1.1, real local font load, hidden/revealed row,
and an independent second instance.

An initial 1px probe produced 2.988px drift at fractional zoom. The same regression
caught it; a 100px probe before the origin avoids that quantization without
expanding positive scroll bounds. An initial CDP-connected run could not query
the nested opaque frame despite visible rendering; only the ordinary official
headless run is recorded as passed.

Also passed: server lint, server typecheck, E2E typecheck, upstream Visualize
integrity (223 verified files), runtime build, registry check (1 test), and
`visualize-sliding-window.test.ts` integration (2 tests, no skips). Integration
used a newly created local disposable `lingxi_window_test` PostgreSQL/Redis pair,
with schema initialized by the normal migrator. Production data was not read.
Dependency versions/locks and the pinned upstream skill are unchanged.

Repeat from the repository root with installed dependencies and official browser:

```sh
npm run build:visualize-runtime
E2E_TELEMETRY_DISABLED=1 PYTHONDONTWRITEBYTECODE=1 npx e2e run --config e2e.visualize-window.config.ts
npm run server:lint
npm run server:typecheck
npm run test:e2e:typecheck
# Dedicated initialized disposable DB/Redis only:
npm run test:integration -- --file visualize-sliding-window.test.ts
```

Limits: axis-aligned positive scales and rectangular selections, not rotated,
skewed or 3D planes. The supported demo is batch send/ack, not full TCP, and size
changes reset it. Existing historical HTML still requires separately authorized
inspection and a targeted remedy. Independent integration review and CI are
owned by the designated integrator; no merge/deploy is performed by this branch.
