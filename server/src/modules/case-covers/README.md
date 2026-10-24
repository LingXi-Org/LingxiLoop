# Hairline case cover generation

This worker-only module consumes an already authorized saved case snapshot and
uses the existing model ledger. It asks for original article-related geometry,
repairs at most once, and leaves storage, leases, ACL and version fencing to the
case module. Original body snapshots are unchanged.

Hairline source is pinned to MIT commit
`37d2e78dcb333ab30c3338e28ed4a690364ea014`. The vendor manifest verifies the
complete skill, rules, concepts, examples, kernel, original builder and validator.
`assembleAndValidate` invokes only the original syntax/style/template checks in
a bounded subprocess. It never evaluates generated JavaScript. The complete
validated original HTML and hashes are retained in metadata as provenance;
that original document is not the interactive asset.

`cover-presentation.ts` returns strict version-2 JSON containing kernel and
figure source. The old result/storage field name `html` is retained solely for
internal compatibility; it must be served inside a JSON response and only passed
as data to the QuickJS Worker. Never serve it as text/html or use srcdoc.
Old HTML payloads fail the parser and new rules fingerprints prevent reuse.

`cover-renderer.ts` now uses a bounded Worker running QuickJS WASM, with no
Chromium, bubblewrap, native DOM, network namespace assumptions or fallback to
host execution. The same guest adapter and virtual clock used by the browser
sample mount/tick-zero geometry. Independent strict JSON/SVG checks precede
static SVG serialization and sanitization. The legacy files `render-limits.py`
and original qualification evidence are historical only and are not launched.

See `src/features/cases/cover-vm/README.md` for capability boundaries, all budgets,
WASM import inspection and remaining verification. Server runtime packaging
requires these exact shared files: runtime.ts, protocol.ts, program.ts,
guest-source.ts and svg.ts. Both root and server dependency manifests must pin
`quickjs-emscripten-core` and `@jitl/quickjs-wasmfile-release-sync` to 0.32.0;
`@jitl/quickjs-ffi-types` resolves transitively to 0.32.0. Locks and Docker changes
are owned by the parent integrator.

Pure tests use fake renderer/model dependencies; they do not imply an actual VM
render or model call passed. The prior bwrap user-namespace probe failed, and
the iframe path was rejected after actual WebRTC egress. Neither is retained as
a security boundary. The new runtime qualification is a separate action;
the old one-action package/upstream probe authorizations are already consumed.
