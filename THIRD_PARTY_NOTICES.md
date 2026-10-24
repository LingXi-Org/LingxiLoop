# Third-Party Notices

## OpenCode agent guidance

The development-scope paragraph in `AGENTS.md` is copied verbatim from
[OpenCode's AGENTS.md](https://github.com/anomalyco/opencode/blob/20a6cc72917586eb5314be075f96dbb21d16c480/AGENTS.md#L48)
at commit `20a6cc72917586eb5314be075f96dbb21d16c480`
(file blob `58b85ffb06ea197135e26593f46d0721b2f57d44`).
Only that paragraph is incorporated into LingxiLoop's repository guidance.
The [upstream license](https://github.com/anomalyco/opencode/blob/20a6cc72917586eb5314be075f96dbb21d16c480/LICENSE)
is reproduced below.

MIT License

Copyright (c) 2025 opencode

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

## assistant-ui Elements

The RunActivity and TaskCard components adapt the official assistant-ui registry
source at commit `1de233d61b09f25f7f14df8a9211edb347559902`:
https://github.com/assistant-ui/assistant-ui/tree/1de233d61b09f25f7f14df8a9211edb347559902/packages/ui/src/components/react/assistant-ui/elements

MIT License, Copyright (c) 2026 AgentbaseAI Inc. Unmodified source snapshots,
the complete license and adaptation notes are retained in
`third_party/assistant-ui-elements/`. The existing Langfuse waterfall remains a
separate source adaptation; it is not attributed to assistant-ui.

## Shadcn Dashboard

The admin workspace layout, metric cards and resource directory composition
adapt Shadcn Dashboard at commit `6f99c0b04b7169f9ef12dc99946bc4faaeb40b9b`:
https://github.com/shadcndashboard/shadcndashboard

MIT License, Copyright (c) 2026 Shadcn Dashboard. The complete license is
distributed at `admin/public/licenses/shadcndashboard.txt`.
Template sample business data is not included in the production application.

## Tremor

The admin workspace uses the source-distributed Tremor AreaChart, DonutChart
and BarList components and their chart utilities from commit
`ca4d588f47820ff3d514d37fa4ee08a4222dec11`:
https://github.com/tremorlabs/tremor

The components in `admin/src/components/tremor` are adapted for the existing
Lucide icons, class utilities, Recharts 3, Chinese category names and keyboard
accessibility. The upstream Apache-2.0 license and included notices are
distributed at `admin/public/licenses/tremor.txt`.

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

## Hairline generated case covers

The pinned kernel, complete template, validators, guidance and original examples
are reused from https://github.com/lucasmarkes/hairline at commit
`37d2e78dcb333ab30c3338e28ed4a690364ea014`. Their unchanged files, full MIT
license (Copyright (c) 2026 Lucas Marques), and per-file SHA-256 manifest are
retained in `server/src/modules/case-covers/vendor/`. The product supplies a
bounded SVG-data adapter; it does not execute the template in the host DOM.

## QuickJS/WASM cover execution

`quickjs-emscripten-core`, `@jitl/quickjs-wasmfile-release-sync`, and its
`@jitl/quickjs-ffi-types` dependency are reused as exact version `0.32.0` packages
from https://github.com/justjake/quickjs-emscripten, pinned by the root and server
lockfile integrities. The official release-sync WASM binary is additionally
checked as SHA-256 `105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232`.

The full distributed license below covers both the TypeScript binding and
embedded QuickJS implementation:

```text
quickjs-emscripten:
The MIT License

quickjs-emscripten copyright (c) 2019-2024 Jake Teton-Landis

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


quickjs:
QuickJS Javascript Engine

Copyright (c) 2017-2021 Fabrice Bellard
Copyright (c) 2017-2021 Charlie Gordon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
