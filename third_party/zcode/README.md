# ZCode Visualize source provenance

Pinned source: [`zai-org/ZCode@0a1fc56d279fd1001f78387bd81aec1c26767411`](https://github.com/zai-org/ZCode/tree/0a1fc56d279fd1001f78387bd81aec1c26767411).

- `skills/visualize/` is the complete, byte-identical 24-file upstream skill. No host adaptation belongs inside it.
- `runtime/tweak.js` is the byte-identical `packages/desktop/src/renderer/src/plugin-sandbox/genUiTweakRuntime.js`. Its hash is already declared by the immutable skill's runtime manifest, although it lives outside that skill upstream.
- `upstream/` preserves the Gen UI UI/service/shared modules, desktop sandbox implementation, guest runtime, shared UI sandbox infrastructure, relevant UI primitives, style and localization inputs, and upstream specifications. These files are reference source; desktop services, registry, Electron integrations, and unrelated imported ZCode product services are not installed as LingxiLoop runtime services.
- `manifest.json` enumerates every retained upstream file with original path, byte count, SHA-256, Git blob SHA-1, and Git mode. The skill tree ID `87f38506cdda363267e0a73bfb2f20b4632134e1` and all 24 blob identities were checked through the GitHub connector at the pinned commit. `imports.json` records literal source imports of the retained TS/TSX/JS files; it is a review aid, not a package installation list.
- `ARCHITECTURE-REVIEW.md` records the audited behavior and Web adapter boundaries. `VERIFICATION.md` records integrity failure cases and the verification command.

Run from the repository root:

```sh
node scripts/verify-zcode-visualize.mjs
python3 -B third_party/zcode/skills/visualize/scripts/render.py \
  third_party/zcode/skills/visualize/examples/calendar.html \
  /tmp/lingxiloop-visualize-calendar.html
```

The verifier checks all archived files, the exact skill file set and pinned Git tree, runtime-manifest hashes including out-of-directory Tweak, and every vendor script/license hash. It requires no network or npm dependencies. The export command exercises upstream `render.py` unchanged and embeds bundled browser scripts as data URLs. A successful export does not establish browser or model E2E acceptance.

The upstream [Apache-2.0 LICENSE](LICENSE), skill [license notice](skills/visualize/LICENSE.md), and all bundled Floating UI, Lucide, and D3 licenses remain intact. Floating UI Core/DOM use MIT, Lucide/D3 use ISC. Dependency versions and npm integrity metadata remain in `skills/visualize/assets/vendor/manifest.json`.
