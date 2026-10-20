# Final OCI auditor — independent correction review

Reviewed 2026-10-20. Exact source:
`/tmp/lingxi-225-219-preparation/final-image-audit/audit.py`
SHA256 `2507419a202bec96f4566a1c2bd62c584a128d52f8cb81d913ac6f56ae7aaf6f`.
The prior reviewed source remains byte-for-byte at
`audit-before-pending-fix.py`, SHA256
`de5d755179a6cb715fe9537db51cd24a23725d2677b74a2b61cf4f9ee926d648`.

**Both prior P2 findings are resolved. No remaining or new P1/P2 was found in
this exact correction and the previously reviewed auditor scope.**
The original report describes the historical de5d defects; this report supersedes
their unresolved status for the source hash above.

## Fix verification

1. **Pending hardlinks no longer resurrect removed entries.**
   The resolution loop first requires `result.get(path) is entry`. Deleted or
   replaced entries are skipped, including equal-valued but distinct objects.
   Still-live entries have their current parent kinds revalidated before content
   resolution. The original real tar ordering `d/x → later`, `d:file`,
   `later:file` now returns only `d` and `later`. A removed link whose target
   never arrives also stays removed, while a valid forward link still resolves.
2. **Ancestor memory expansion now has explicit bounds.**
   Normalized paths and merge inputs are limited to 128 components before prefix
   expansion. Unique ancestor count is capped at 300000, with at most 64 MiB
   cumulative UTF-8 prefix bytes. Both limits are checked before insertion,
   including when seeding ancestors from lower entries. Shared prefixes are
   charged once. Failure uses fixed `path_depth_limit`/`ancestor_index_limit`
   codes and propagates through the existing non-success exit.
   These are logical metadata bounds, not a claim that total Python RSS is 64 MiB.
3. **The correction stays narrow.**
   A fresh unified diff exactly matches `pending-boundary-delta.patch`.
   Source-function comparison identifies only `path_name` and `merge_layer`
   changes; the patch adds the three declared constants. `remove_path` and the
   whiteout/opaque application blocks are unchanged byte-for-byte. The streaming
   readers, full layer/hash accounting, registry identity checks, privacy/error
   output, comparison logic and receipt handling are unchanged.

## Independent limited checks

Executed Python with `-B`, blocked socket construction after module import, and
selected only nine related in-memory cases from the actual final test module:

- deleted pending link and replaced pending entry;
- equal-valued replacement checked by object identity;
- 128/129 path-component boundary;
- ancestor bytes for lower and newly added entries;
- ancestor count bound;
- valid hardlink content identity/forward reference;
- implicit lower-parent replacement;
- implicit same-layer-parent replacement.

Result: **9/9 passed**, no failures. This was not a rerun of the complete matrix.
Some defensive replacement tests call `merge_layer` directly because the scanner
already rejects duplicate archive paths; the originally reported resurrection
case runs through the actual gzip/tar scanner.

Four additional small assertions passed without large allocations:

- a two-byte UTF-8 ancestor is accepted at exactly two bytes;
- the same ancestor is rejected with a one-byte budget;
- two siblings sharing an ancestor fit a one-ancestor budget;
- a deleted pending link stays deleted when its target never appears.

The author's recorded full suite is **22/22** in
`pending-boundary-green.log`; I read, but did not repeat, that matrix.
The retained red logs show the original real-tar resurrection, absent resource
bounds, replacement handling and the distinct-object identity control.
All **22 supplied SHA256SUMS entries** match, including final source, prior
source, tests, patches, handoff evidence and red/green logs.

## Scope and remaining gates

No network, registry, production, provider, Docker or database calls were made.
No auditor/product/source file was modified, and no bytecode cache or probe
artifact was written. Only this requested private report was created.

The earlier review's limits remain: logical merged-rootfs sizes differ from
compressed/expanded layer totals; historical baseline is not freshly measured;
unsupported tar features fail closed. The aggregate expanded-byte limit is checked
after each completed layer, not at every remaining-budget byte. Accept a real
audit only with exit 0 and `receipt.passed:true`, using the intended reference flags.

This approves the reviewed auditor correction, not a candidate OCI image.
No image digest was inspected or inferred, and no readiness, migration, isolation,
Worker health, successful publication or production deployment result is asserted.
