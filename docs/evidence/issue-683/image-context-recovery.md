# Production image context recovery

Release main cdc331679264d7cad9c10b6933303bdd501eb901 has the exact qualified
combined tree, but its first complete image build exposed an obsolete input.
Run41873526181, server image job126727539526 failed at17:04 UTC on
`COPY server/assets ./server/assets`: retiring the final tracked Visualize
assets removed that source directory from a clean checkout. Local generated
editor output can leave the directory present and mask this build error.

Remove only that obsolete checkout copy. Design and Slides assets still enter
the final image through their unchanged `COPY --from=design-build` and
`COPY --from=slides-build` instructions. Their serving/checker consumers and
the retained Visualize inert archive sources remain unchanged. The existing
shared runtime import graph check now reflects the corrected source list.

Add a committed-checkout guard for every direct runtime COPY source. It reads
the Git index rather than local generated directories. Before the correction,
that focused guard failed specifically for server/assets. Afterwards the whole
owning production-rag-contract suite passed34/34 with no skips (7.93s).
`git diff --check` passed. These source/contract checks are not a successful
Docker image build; the corrected commit still needs exact CI and its full
published image build.

The failed release never reached prefetch or deployment, so runtime provenance
CAS was not submitted and source production remains formal3.8.24/product62.
Use the existing sole integrator and canonical release entry after independent
incremental review. Preserve the reviewed global queue and recovery gates;
do not replay the failed old source build or change credentials/security.
