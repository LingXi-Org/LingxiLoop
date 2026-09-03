# Third-Party Notices

## Production topology references

The Refine production overview adapts the 2.5D isometric canvas language from
FossFLOW commit `59d51ec5a0be809522bc7b53cd70a50fc8dffbe6` and the read-only health-overlay
model from Rackpad commit `05b75b85f3cd168bc95cd3ff8439a20d7c2cb04c`:

- https://github.com/victortassinari/FossFLOW
- https://github.com/Kobii-git/rackpad

Both references are MIT licensed. No editor or React Flow runtime is bundled;
the production map is implemented with the project's existing React, SVG and CSS.

## Dokploy

The Refine release dashboard adapts Dokploy's centralized deployment table
component from commit `261ebb2317c324ae38f90bcacdd888ae06a04590`:
https://github.com/Dokploy/dokploy/blob/261ebb2317c324ae38f90bcacdd888ae06a04590/apps/dokploy/components/dashboard/deployments/show-deployments-table.tsx

The adapted source is retained in `admin/src/dokploy-deployment-board.tsx`
under the Apache License, Version 2.0. Copyright 2026-present Dokploy
Technology, Inc.

## Kuma Mieru

The Refine service-status dashboard adapts Kuma Mieru's
`StatusBlockIndicator` and `MonitoringChart` components from commit
`26a1ed33c1f5bfc77ba51fc61221a0c08dff2134`:
https://github.com/Alice39s/kuma-mieru

The adapted source is retained in `admin/src/kuma-mieru.tsx` and
`admin/src/kuma-mieru-chart.tsx` under the Mozilla Public License, Version 2.0.
The required source-form notice and license URL are preserved in both files.

## Excalidraw Canvas Fonts

LingxiLoop vendors the Assistant, Excalifont, and Xiaolai WOFF2 font assets
used by its Canvas UI from Excalidraw commit
`e1bb9ff8f8931e783c11d104abb8967ac6605c9a`:
https://github.com/excalidraw/excalidraw/tree/e1bb9ff8f8931e783c11d104abb8967ac6605c9a/packages/excalidraw/fonts

The font assets are stored under `src/features/canvas/fonts/Assistant`,
`src/features/canvas/fonts/Excalifont`, and
`src/features/canvas/fonts/Xiaolai`. Their local `@font-face` declarations
are in `src/features/canvas/canvas-fonts.css`.

All three font families are distributed under the SIL Open Font License,
Version 1.1. The complete license text is retained at
`src/features/canvas/fonts/OFL-1.1.txt`.

## Bible Strong Avatar

The dynamic LingxiLoop product avatar uses `@bible-strong/avatar-react` and
`@bible-strong/avatar-core` version 0.1.0:
https://github.com/smontlouis/bible-strong-avatar-lab

AGPL-3.0-only, Copyright (c) Stéphane Montlouis-Calixte and contributors.

## Open Notebook

LingxiLoop's native knowledge engine vendors Open Notebook from commit
`a7de90d38aaf18ee85fd661854d35c11e44613e2`:
https://github.com/lfnovo/open-notebook

The vendored source is maintained directly in `third_party/open-notebook` and
includes LingxiLoop workspace scoping and idempotency. Its complete MIT license
is retained at `third_party/open-notebook/LICENSE`.

MIT License, Copyright (c) 2024 Luis Novo.

## LingXi interactive-lecture-deck

LingxiLoop's deterministic HTML lecture renderer is adapted from the visual,
camera, spatial and interaction contracts in `interactive-lecture-deck`, pinned
to commit `ca99f2227c4b35c918d294316ea5d0960c9d0f48`:
https://github.com/LingXi-Org/LingxiSkills/tree/ca99f2227c4b35c918d294316ea5d0960c9d0f48/skills/interactive-lecture-deck

The immutable upstream runtime snapshot and provenance are retained under
`third_party/interactive-lecture-deck`. The adapted runtime also preserves the
co-planarity fix from `a5802b9db011e414c0f616a11225564d59e9991a` and the
slow-iframe race fix from `2973db3db5f1282cfbebad6da553a0d351c7a1b5`.

MIT License, Copyright (c) 2026 LingXi Team. The complete license text is
retained at `third_party/interactive-lecture-deck/LICENSE`.

## OpenMAIC architecture reference

The presentation research, planning, checkpoint, critic and targeted-repair
stages were independently implemented with architectural reference to OpenMAIC
at commit `dfebbcf33f3a56064129903faeab70a9e4243146`:
https://github.com/THU-MAIC/OpenMAIC/tree/dfebbcf33f3a56064129903faeab70a9e4243146

No OpenMAIC rendering DSL or rendering source code is included.

## OpenMausBot

Portions of the desktop conversation UX and visual system are inspired by
OpenMausBot: https://github.com/milind-soni/OpenMausBot

MIT License

Copyright (c) 2026 Milind Soni and OpenMausBot contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Bloub

The Agent avatar morph engine is derived from Bloub:
https://github.com/jeremy-prt/bloub

MIT License

Copyright (c) 2026 Jérémy Perret

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
