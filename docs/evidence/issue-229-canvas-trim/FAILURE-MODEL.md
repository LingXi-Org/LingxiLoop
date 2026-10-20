# #229 glibc Canvas trim: failure model before implementation

Scope is the **server production dependency stage** of the frozen `d1075e35` candidate, on `linux/amd64` Node 22 Bookworm/glibc. The SPA build stage and its dependencies stay complete. This is a separate draft; it does not change the published image or production.

1. **Wrong platform or changed package.** A future musl base, non-x64 image, changed `@napi-rs/canvas` version, loader or native binaries must stop the build before deletion. Check `process.platform`, `process.arch`, glibc runtime, package versions, directory layout and the audited file SHA-256 values.
2. **Active GNU binary is accidentally removed or cannot load.** Delete only `@napi-rs/canvas-linux-x64-musl/skia.linux-x64-musl.node`; retain both package manifests, README files, the parent `@napi-rs/canvas` LICENSE, and the GNU binary. In separate Node processes before/after deletion, load Canvas, inspect which `.node` file was selected, and draw an actual PNG.
3. **PDF.js needs native Canvas through a dynamic path.** Run the packaged LingxiOS document-worker on the unchanged PDF fixture with the musl binary absent, compare exact output hash with the unmodified image, and retain the PDF.js parser, worker, CMaps, standard fonts and WASM.
4. **A future consumer requires musl portability or another libc.** The trim is fixed to the current glibc-only final runtime stage and guarded by the audited loader hash. Moving to musl or expanding image platforms requires a new audit. A build that cannot prove this condition fails.
5. **The apparent 30 MB gain is mistaken for whole-image savings.** Record regular bytes and reproducible single-file gzip only as an upper-level proxy; actual candidate OCI layer and full-image deltas require a completed build. Hardlinks and tar compression cannot be inferred from raw file size.

Stop this round after either this single bounded candidate has a passing isolated short check and draft PR, or its checks fail. Other large packages remain documented candidates rather than speculative deletions.
