# Mobile safe-area follow-up

The integrator identified the missing mobile safe-area padding in #634. This
record independently reproduces it with the actual local Sidebar/Sheet/layout
components; no files or measurements from the integrator's environment were read.

The runtime change restores `padding-block: env(safe-area-inset-top)
env(safe-area-inset-bottom)` on mobile navigation and on the retained mobile
Canvas. The Canvas rule is conditional on `isMobile`, leaving desktop unchanged.
State, transitions, focus handlers, editor code and #627 files are unchanged.
The fixture uses `viewport-fit=cover`, matching production.

Run the existing Vite dev server, then:

```sh
node docs/evidence/issue-628/safe-area.mjs
```

Chromium 154.0.8037.57, using the DevTools Protocol
`Emulation.setSafeAreaInsetsOverride`, simulates a 44px top and 34px bottom inset.
This exercises the browser's real `env()` resolution, rather than replacing the
production styles with literal test padding. It is not a physical-device test.
The test uses the existing synthetic document/service fixture.

On base `00545b46`, the regression failed (`0 !== 44`); baseline mode
(`SIDEBAR_EXPECT_UNSAFE=1`) captured `before.json`. After the two style changes,
the same focused regression passed (`after.json`):

| Viewport | Panel | Padding top/bottom before → after | Close button top before → after |
| --- | --- | --- | --- |
| 390×844 | Slides navigation | 0/0 → 44/34px | 9.5 → 53.5px |
| 390×844 | Canvas | 0/0 → 44/34px | 9.5 → 53.5px |
| 320×780 | Slides navigation | 0/0 → 44/34px | 9.5 → 53.5px |
| 320×780 | Canvas | 0/0 → 44/34px | 9.5 → 53.5px |
| 1400×900 | Both | 0/0 → 0/0px | unchanged |

The replay also checks initial collapse, keyboard opening, close/Escape focus
return, reopening, the retained Canvas iframe, reduced motion, and no horizontal
page overflow. No browser page errors occurred. Targeted lint passes with only
the pre-existing native provider's cookie warning. No full local test rerun or
production writes were performed for this focused style correction; final SHA CI
is tracked on the same PR.
