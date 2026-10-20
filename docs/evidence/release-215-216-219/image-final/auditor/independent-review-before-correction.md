# Independent final OCI auditor review

Reviewed 2026-10-20. Frozen file:
`/tmp/lingxi-225-219-preparation/final-image-audit/audit.py`
SHA256 `de5d755179a6cb715fe9537db51cd24a23725d2677b74a2b61cf4f9ee926d648`.
The SHA and all 14 entries in the supplied SHA256SUMS were checked.
This report applies to this exact revision, not to a subsequent correction.

**Conclusion: one reproduced P2 in pending-hardlink merge semantics and one
P2 resource-bound gap in the new ancestor cache need correction before accepting
the auditor as a general fail-closed merged-inventory gate.** Neither is a
finding against the product image; no registry or image was accessed.

## P2 — a removed pending hardlink is resurrected after a parent replacement

Location: `audit.py:173–182`, especially unconditional assignment at line 178.

`merge_layer()` records unresolved forward hardlinks in `pending`. A later upper
file can remove such a link through `remove_path()`, but the pending queue retains
it. At the final resolution pass, the code inserts it back without checking that
the original pending entry still exists or that its current parents are directories.

I confirmed this with the actual `scan_layer()` using a tiny gzip/tar built wholly
in memory, in this order:

1. `d/x`: hardlink with target `later` (not yet present);
2. `d`: regular file;
3. `later`: regular file.

Actual return: `{d: file, later: file, d/x: hardlink}`. The scanner returned success
and verified the complete compressed/expanded sizes and both digests. This is an
impossible rootfs containing a child beneath a regular file. The removed child must
not reappear; failing closed would also be acceptable if this ordering is unsupported.
The prefix-based package comparator does not validate ancestors outside its prefix,
so this malformed merged map can also misrepresent package presence.

Minimal correction: resolve a queued item only if `result[path]` is still that
same unresolved entry; skip entries removed/replaced by subsequent upper members.
Recheck parent validity before insertion and retain rejection of genuinely
unresolved/cyclic active links. Cover deleted pending entries and valid forward
links in the offline regression.

This bug is present in the old algorithm as well; it is not caused by the ancestor
optimization. The supplied 16 tests do not cover pending-link deletion.

Probe scope: Python `-B`, actual frozen module, in-memory tar/gzip only, socket
construction disabled after module import, no registry, subprocess, temporary
archive or result-file write. The first probe setup installed the socket block
before importing Python's ssl module, which caused an import TypeError; that is
a review-harness mistake, not an auditor failure. The corrected probe produced
the result above. No author source was edited.

## P2 — the ancestor cache can greatly exceed the advertised metadata bound

Location: `audit.py:146–151,154`; path-length admission at `:120–128`.

Every ancestor is materialized as a separate string, without a depth, count or
byte bound for this set. The 64 MiB `MAX_INVENTORY_BYTES` checks count final path
and entry metadata, not these retained ancestor strings; they also happen after
construction. The optimization therefore introduces quadratic memory expansion
in path depth even for a very small inventory.

A permitted 16,383-character path consisting of 8,192 one-character components
has 8,191 ancestors with a total of 67,092,481 prefix characters, before Python
string/set overhead. Thirty-two such paths with disjoint first components require
over 2.1 billion retained prefix characters while the final path inventory itself
is roughly 0.5 MiB. The whole-audit alarm does not provide a memory bound.

This is a static bound calculation; I did not construct the large sets or attempt
an OOM/stress run. The narrow remedy is a reasonable documented maximum path depth
and/or ancestor count/byte budget checked before insertion. Reject excess inputs
with a fixed error code. No general trie framework or product change is required.

## Verified behavior outside these findings

- **Ancestor semantics:** `ancestor-delta.patch` changes only `merge_layer`.
  It starts from surviving lower paths and remembers every upper path before
  replacement. Hints remain monotonic. Therefore an absent path with descendants
  cannot bypass `remove_path()`, including implicit lower and same-layer parent
  directories; stale hints cause extra scans only. The supplied two semantic
  implicit-directory tests are appropriate. The removed pending-link issue is
  outside this optimization's decision.
- **Whiteouts:** normal/opaque removals operate on the lower map before ordered
  upper additions, so later or earlier whiteout markers cannot erase same-layer
  replacements. Subtree removal and explicit non-directory-parent rejection
  are present. Root opaque deletion is handled.
- **Existing hardlinks:** an immediately resolvable target's hash/size is copied
  at that point, retaining old content identity when the target is replaced later.
  Missing or cyclic active targets fail. Symlinks are never followed on the host.
  Unsupported entry types and sparse files fail rather than disappearing silently.
- **Complete layer accounting:** the compressed reader is size-bounded and hashes
  all bytes. The expanded reader covers tar bytes, record padding and gzip trailers;
  the tar parser uses `ignore_zeros=True` plus the explicit bounded TarInfo hook.
  Both readers are drained and compressed size/digest and expanded diff_id must
  match before a layer is accepted. Invalid/truncated headers and nonzero trailing
  junk fail. Merged file bytes are separately labelled from total layer bytes.
- **Identity and references:** immutable repository/index SHA and exact commit are
  required; metadata digests/sizes, unique linux/amd64 selection, config platform,
  source revision and diff-ID count are checked. Runtime/PDF reference hashes and
  file counts are fixed when their flags are supplied. Historical baseline totals
  are explicitly not remeasured and are not attributed solely to PDF pruning.
- **No body/credential persistence:** no extraction, Docker, shell or layer-spool
  path exists. File contents are read only in bounded chunks for hashing. Config,
  Env, labels, history and anonymous pull token are not emitted. Saved inventory
  contains path/kind/owner/mode/size/hash and link-target metadata, not file bodies.
  HTTPS redirects reject credentials/downgrades and drop cross-origin Authorization.
- **Errors and output:** network/parse/assertion failures emit fixed code, status
  and progress only, without exception/HTTP body or token. Exclusive output
  directory creation prevents evidence overwrite. Package mismatch sets
  `receipt.passed:false` and returns nonzero. Qualification must require both
  exit 0 and `receipt.passed:true`; an inventory/receipt file alone is insufficient.

The aggregate expanded-byte limit is checked after each completed layer. It is
a bound on accepted totals, not a promise to stop decompression at exactly the
remaining aggregate byte budget. Per-layer limits and the overall time limit
still apply. No measured image-size claim is made by this review.

## Existing evidence and scope

The author-recorded final suite is 16/16 in 0.015 seconds; I read the test source
and logs without rerunning that matrix. The ancestor red is specifically 100
unnecessary removal scans versus expected zero, not a semantic regression.
The recorded old/new small benchmarks compare equal actual outputs/hashes.
The old 40k case is correctly identified as analytical rather than a measured run.

This review made zero network, registry, production, provider, database or Docker
calls. It did not run the full functional suite or change auditor/product files.
Only the requested private review was written. No conclusion is drawn about the
candidate image, successful build workflow, startup, migration readiness, kernel
isolation, Worker health or production deployment. Parent is coordinating a
minimal tool-only correction; its new exact SHA requires delta review.
