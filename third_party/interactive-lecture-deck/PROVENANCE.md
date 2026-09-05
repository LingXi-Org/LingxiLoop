# interactive-lecture-deck provenance

LingxiLoop pins its lecture-deck visual and interaction reference to:

- repository: `https://github.com/LingXi-Org/LingxiSkills`
- path: `skills/interactive-lecture-deck`
- snapshot: `ca99f2227c4b35c918d294316ea5d0960c9d0f48`
- upstream runtime blob: `466215898d02764eb5cb615e48a7b8a1e405b084`
- vendored runtime SHA-256: `0bb0c565ac99ebebd6f428f134b42865719007000947fe309f71ff4d663a928b`

The unmodified upstream runtime snapshot is retained as `runtime/index.html`.
LingxiLoop does not execute it directly. The trusted, self-contained runtime
compiled by `server/src/modules/presentations/renderer.ts` is an adapted,
deterministic implementation that preserves the upstream fit, interaction,
spatial, camera, protected-view and 1500px-perspective contracts.

The adaptation also deliberately preserves the behavior of these upstream
fixes:

- `a5802b9db011e414c0f616a11225564d59e9991a`: iframe, highlight and geometry
  probe remain co-planar.
- `2973db3db5f1282cfbebad6da553a0d351c7a1b5`: stale, slowly-loading iframe
  callbacks cannot overwrite a newer slide/step.

License: MIT. See `LICENSE` in this directory.
