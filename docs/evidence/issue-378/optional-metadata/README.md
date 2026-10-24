# #378 optional metadata miss path

Base `55f62548` has the same frontend bytes as the profiled `033fa2dd`.
The bounded real-browser diagnosis found activityAnnotation/answerSegment schema
failure work under message selectors:14.842s/10.270s inclusive CPU subtrees in
the old/new A–G samples. The original profiles and their limits are preserved in
PROFILE.md and profile-raw.tar.gz; this is neither a device FPS claim nor proof
of a memory leak. The same main-thread timer programme emitted different update
counts, so no causal equal-payload percentage speedup is claimed.

The product change is only two optional-field checks. When the extracted value
is exactly undefined, return the same undefined result without a schema call.
Present null/malformed values still enter the original schema. Valid activity
semantics, strict fields, version and segment coordinate/text-length validation
remain unchanged. No cache, object retention, subscription, renderer, permission,
budget or dependency change is included.

The regression observes the actual public schema operation, including the private
segment schema through a scoped test-only Zod factory wrapper. Its old-source
run returned the same undefined outputs but made3000 calls per schema and6000
failure results (94.7ms raw Node sample), failing the zero-call assertion. After
the guard, missing reads make zero schema calls/failure allocations. Existing
present-value negative and valid cases still exercise their schema paths. Node
elapsed samples describe this isolated operation, not browser speedup.

Focused old/new logs are before.txt and after.txt. Owning TypeScript and3-file
lint passed. Initial compatibility checks omitted tracked files in a sparse
checkout; only those existing source paths were materialized and the checks
rerun, with no product workaround. Exact CI and independent review belong to
the draft PR. One later combined candidate profile for the three assigned
#378 fixes is root-coordinated; no per-helper browser sample was added.

Rollback removes the two undefined checks. No issue outside the already-owned
#378 scope was claimed, and no merge, deploy, provider or private production
operation was performed.
