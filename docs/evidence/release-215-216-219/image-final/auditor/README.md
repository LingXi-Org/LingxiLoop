# Prepared final OCI audit (not executed against a registry)

`audit.py` uses Python standard library only. It borrows the immutable SHA/size and streamed-tar approach from the repository's `measure-oci-manifest.py` and `measure-oci-layer-files.py`, adds full config/diff-ID verification and applies layer whiteouts to one merged rootfs inventory. It does not call Docker, invoke shell subprocesses, read credentials, extract members, save blobs, or make production/provider requests.

The final image digest/commit are deliberately not supplied. The coordinator must review the script and substitute the **actual immutable final index digest and exact built commit**, after successful image publication. Run once into a new output directory:

```bash
python3 /tmp/lingxi-225-219-preparation/final-image-audit/audit.py \
  'ghcr.io/lingxi-org/lingxiloop-server@sha256:<actual-final-index-digest>' \
  '<actual-final-40-character-source-commit>' \
  '/tmp/lingxi-225-219-preparation/final-image-audit-result-<unique-run>' \
  --runtime-tar /tmp/lingxi-225-219-preparation/runtime358-formal/lyyzka-lingxios-3.5.8.tgz \
  --pdf-inventory /tmp/lingxi-225-219-preparation/pdfjs358-qualification/inventory-after.json \
  --baseline /workspace/LingxiLoop-integration-215-216-219/docs/evidence/issue-229-oci/oci-layers-20261020.json
```

The angle-bracket placeholders intentionally fail validation. All three comparison flags should be retained for final qualification. Runtime tar and PDF inventory hashes/counts are pinned to the currently reviewed references (474 and 379 regular files); a new reference requires deliberate code/review update, not an inferred version substitution.

The script first checks local references. It then obtains a standard anonymous public GHCR repository-pull token into memory and uses verified HTTPS. Cross-origin redirects drop Authorization. HTTP errors, including 401/403, fail with no retry or credential fallback. Metadata/config bytes are digest/size checked but never written; only the exact expected source commit is emitted from config, never Env or raw labels/history. It selects exactly one linux/amd64 descriptor and verifies its config architecture and every layer's gzip SHA256/size and expanded `rootfs.diff_ids` digest. Config source commit mismatch stops before layers.

Each layer is streamed once through bounded gzip/tar readers. Ordinary whiteout and opaque deletion affect lower entries only; same-layer replacements survive regardless of whiteout order. Non-directories remove obsolete lower subtrees. Hardlinks record target and resolved content hash/size, preserving links created before a same-layer target replacement. No symlink is followed on the host. Unsupported sparse/device/FIFO entries, unsafe/duplicate paths, children beneath non-directory entries, unresolved/cyclic hardlinks, invalid tar trailing bytes, or unsupported compression fail closed. A legitimate image needing one of these unsupported tar features needs a narrow reviewed parser extension; an incomplete inventory is never reported as complete.

Safety bounds: 30-second individual network I/O timeout, default 1200-second whole audit alarm (maximum 1800), at most 128 layers, 2 GiB total compressed descriptor sizes, 4 GiB expanded tar bytes, 300000 entries and 64 MiB logical metadata per layer/rootfs. It writes only metadata JSON, typically a few MiB for this image. It never stages the approximately 200 MiB compressed / 600 MiB expanded image on the limited local disk.

Successful output:

- `receipt.json`: immutable index/manifest/config identities and sizes; exact commit; each layer's compressed and fully expanded tar bytes; whole-image totals; merged file-kind counts, regular-file logical bytes and separate hardlink logical bytes; largest files/packages and deps/dist totals; exact package inventory comparisons; inventory SHA; explicit readiness/isolation **not-tested**.
- `rootfs-inventory.json`: sorted rootfs paths with kind, permission/owner metadata, regular content size/SHA256, and link targets/resolved hardlink SHA. No file bodies.
- On failure: `failure.json` with fixed code/stage/count/status only, no remote error text, URL query or token. A package mismatch may additionally leave a verified inventory and `receipt.json` with `passed:false`; never treat file existence as success. Accept only process exit 0 **and** receipt `passed:true`.

The recorded baseline is historical index `sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee`, source `ac9069460e99a20fac7f2c3de87c60f2bec66924`, 22 layers, 206838733 compressed bytes / 623327232 expanded tar bytes. `baselineRemeasuredThisRun:false` explicitly distinguishes existing evidence from a fresh measurement. Whole-image delta includes every source/dependency/layer change; it is **not attributable solely to PDF pruning**. Merged rootfs logical bytes are also not equivalent to compressed image bytes or physical disk usage. Attestation manifests/non-amd64 objects are not downloaded or included in platform layer totals.

Initial local validation only: 13 synthetic in-memory tests passed, with no sockets or subprocesses. Cases cover full layer/diff digest and byte counts, whiteout/opaque ordering, subtree replacement, hardlink identity/forward references, unsafe/cyclic/duplicate paths, metadata corruption, wrong commit before layers, truncated gzip, invalid trailing tar, PAX long names, unexpected package symlinks, complete fake-registry CLI metadata output, and HTTP denial redaction/no retry. `local-tests-initial-red.log` retains the initial trailing-tar failure caused by this Python's accelerated TarInfo path; the explicit parser hook closes it in the final green run. `local-reference-check.json` hashes only existing local reference files. No current or baseline OCI layer was fetched in preparation.

This audit does not establish container startup, migration readiness, Worker health, kernel isolation, live-provider behavior or production deployment. Those remain separate gates.

## Prior ancestor-hint optimization

The original reviewed script is retained byte-for-byte as `audit-before-ancestor.py` (SHA256 `9e1cd519ec515cc804050676447113a2362f16fcbb380ea9674aa069b99230a3`). `ancestor-delta.patch` contains the complete implementation change: only `merge_layer` changed. `remove_path`, whiteout and opaque-directory logic remain byte-for-byte unchanged.

A monotonic ancestor set covers lower and same-layer implicit directories. New leaf paths that cannot replace anything skip the original full-map removal scan; existing paths or paths that might have descendants still use it. Hints are never removed, so stale hints only cause conservative extra scans. Before changing code, two implicit-parent deletion fixtures and an expected-zero-scan regression were added. The old code passed the semantic fixtures but failed the latter (100 unnecessary calls); `ancestor-red.log` preserves this. That checkpoint suite is **16/16**, including the original 13 cases; `ancestor-green.log` records it.

`benchmark_ancestor.py` is a network-free reproducible comparison. Actual old/new outputs and inventory hashes match for 4000 additions and 10000 lower entries + 2000 additions. Measured merge times were 1.188610→0.018621 seconds and 3.377531→0.035604 seconds; old scan counts 7998000 / 21999000 became zero. The optimized 40000-entry append-only case took 0.178895 seconds and matched the exact append-only dictionary/hash. **The old 40000-entry case was not run**: its 799980000 full-map visits are analytical, not a measured time. These are merge-function microbenchmarks, not full OCI audit or production performance measurements. `ancestor-performance.json` records all counts and hashes.

Current script digest and prior source identities are in `handoff.json` and `SHA256SUMS`. Registry/layer/provider/production requests remain zero; final image identity remains unset.

## Final independent-review P2 correction

The independently reviewed intermediate source `de5d755179a6cb715fe9537db51cd24a23725d2677b74a2b61cf4f9ee926d648` is retained verbatim as `audit-before-pending-fix.py`. It could resurrect a deferred hardlink after a later regular file replaced its implicit parent. Real `scan_layer` tar input `d/x → later`, then `d:file`, then `later:file` reproduces the problem. `pending-boundary-red.log` retains this and the unbounded ancestor-index fixtures (16 existing pass / 5 new fail). A separate equal-valued, distinct-object replacement red is in `pending-identity-red.log`.

The final loop processes a deferred entry only when `result[path] is entry`; removed/replaced records remain gone, including replacements with equal dictionary values. Current parent kinds are checked again before a still-live deferred entry resolves. Only `path_name` and `merge_layer` changed in this correction, plus three limit constants. `remove_path` and the whiteout/opaque application blocks are byte-for-byte unchanged. `pending-boundary-delta.patch` is the exact de5d→final delta; `full-auditor-delta.patch` records original9e1cd→final.

Normalized tar/hardlink paths now allow at most128 components, checked before prefix expansion. Ancestor hints independently permit at most300000 unique prefixes and64MiB cumulative UTF-8 prefix bytes, checked before insertion. Small patched-budget tests exercise lower entries and newly added paths without allocating large structures. These limits fail closed, leaving no successful receipt, and do not weaken any archive validation.

Final validation: **22/22 tests pass** in `pending-boundary-green.log`, including all prior16 and six new cases. The final 40000-entry synthetic result still has hash `a422f572b633788dd87ec8f7e54195aa7ae7dc37657c169277797ba430c6a435`; it took0.144308 seconds in this run (`pending-fix-40000.json`). The original quadratic40k case was not run. Registry, production, provider, Docker and database requests remain zero. Final immutable target digest/commit remain unset pending the coordinator's published-image identity.
