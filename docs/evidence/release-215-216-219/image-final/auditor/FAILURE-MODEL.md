# Final image streaming audit failure model

Prepared before implementation. This audit reads immutable registry objects, never runs an image or changes production. No target digest is known or inferred yet.

- Mutable/wrong repository, wrong platform or ambiguous platform, changed metadata, wrong source commit: reject before layer reads. Verify index/manifest/config raw SHA256 and advertised lengths; independently verify layer compressed SHA256 and expanded diff_id against config.
- Truncated/wrong gzip or length, nonzero unparsed tar trailing data, unsupported compression, oversized metadata/layers/member counts or deadline: fail closed, no successful receipt. Streaming buffers must remain bounded, without writing blobs or member content.
- Redirected registry blob requests: never forward bearer authorization to a different origin. Use anonymous public GHCR token only in process memory; do not inspect Docker credentials or environment secrets. TLS verification remains enabled. No auth denial retry/bypass.
- Overlay application: ordinary whiteouts remove only lower entries/descendants; opaque directories hide lower descendants but preserve same-layer additions regardless of marker order. Non-directories replace previous subtrees. Hardlinks retain the referenced content hash/size, including lower-layer targets; missing/cyclic/unsafe paths fail. Do not extract through symlinks. Unsupported sparse/device entries must be explicit or fail, never silently count as files.
- Distinguish sum of compressed layer bytes, sum of fully expanded tar bytes and merged rootfs regular-file logical bytes. Whiteouted data remains in image layers; package shrink is not claimed as whole-image shrink.
- Reference inventory comparisons: hash full formal runtime tar file entries and compare exactly under installed runtime root; PDF expected inventory compares all paths/size/hash and excludes extras. No binary bodies or package JSON/Env are saved. Config is used only in memory to validate exact commit/platform/diff IDs.
- Baseline is archived evidence, not a new measurement. Save its source path/hash and immutable index identity; label comparison explicitly historical. No readiness, isolation, running Worker or production health inference.
- A failure receipt contains only a fixed error code/stage, HTTP status if relevant, and progress counts. No exception text, response body, URL query, token or raw config is emitted. Output directory must be new; no overwrite/retry of uncertain execution.

Local tests use tiny synthetic in-memory tar/gzip/registry objects only. No Docker, sockets, npm, database, provider or production request is required to test this script.

## Ancestor-hint optimization (added before implementation)

An unconditional no-existing-path fast path is unsafe: a lower entry `implicit/deep/child` can exist without an explicit `implicit` directory entry. A later file at `implicit` must remove the subtree. The same condition can be created earlier within the current layer. Added both fixtures before optimization, plus an expected-zero-delete-scan test for entirely new leaf paths. Preserve the original algorithm as `audit-before-ancestor.py` at SHA256 `9e1cd519ec515cc804050676447113a2362f16fcbb380ea9674aa069b99230a3`.

Use a monotonic set containing every ancestor of every lower/added upper path. A path absent from both the live map and that set has neither itself nor descendants to remove. A stale hint may only cause an unnecessary original scan. No whiteout/opaque handling or `remove_path` behavior changes. Compare actual old/new outputs on the existing bounded samples, and run only the optimized implementation at 40000 entries; mark the old 40000-entry scan count as mathematical, not measured runtime.

## Independent review P2: deferred hardlinks and ancestor bounds

Before implementation, freeze `de5d755179a6cb715fe9537db51cd24a23725d2677b74a2b61cf4f9ee926d648` as `audit-before-pending-fix.py`. Real streamed tar order `d/x` hardlink to `later`, then regular file `d`, then regular file `later` currently resurrects deleted `d/x` at deferred resolution. The pending record must still be the exact same object at its path; deleted or replaced entries stay absent/replaced. Revalidate current ancestors immediately before resolving a still-live hardlink. Identity matters even when a replacement has equal values.

Path length alone does not bound the ancestor index: a 16383-character/8192-component path can allocate roughly 67 million prefix characters. Before computing prefixes, cap normalized path depth at128; independently cap monotonic ancestor hints at300000 entries and64MiB cumulative UTF-8 prefix bytes. Check budgets before inserting each new hint. Small patched-limit fixtures exercise both lower-index initialization and same-layer additions without allocating large data. Whiteout, opaque, and `remove_path` semantics must remain unchanged.
