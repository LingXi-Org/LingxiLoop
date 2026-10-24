# Pinned kit dependency preparation

Refs #377. This follow-up starts from main
`d3c08b994888e95159795950a3394df1d9f0b9df`, including the completed public-resource
cache from PR396.

The fixed `visualize.html` always imports Floating UI Core, Floating UI DOM and
Lucide. The host previously waited for that HTML response before starting those
three reads. Their dependencies are already known for SHA-256
`42d9c7d924174a23545ad2ffc31ec0692ca589b3999c2ffdc21c1d358f4185bf`.

When the authorized page response identifies that exact kit, preparation starts
the three existing reads alongside CSS, kit and runtime. A map local to this one
document reuses each promise when HTML substitution reaches it. It adds no
cross-page in-flight sharing. Unknown/missing kit hashes retain HTML-based
discovery; D3 and calendar remain conditional. The existing host still owns page
admission, capabilities, hash checks, cancellation and failure cleanup. Final
fresh state reads, script ordering, CSP, opaque frames and ready semantics stay
on their existing paths.

The regression used the real pinned kit with its response held by a deferred
promise. Before implementation, no fixed vendor had started and its failure was
also delayed behind the kit (two expected failures). After implementation, all
three start before the kit settles, each is read once, an immediate dependency
failure rejects preparation, and the entire generated document is byte-equal to
the unchanged discovery path. Optional resources and unknown kit behavior are
covered separately.

Validation: Node 22.23.3, six focused assertions passed across
`document-preparation.test.ts` and `public-resource-cache.test.ts`; Biome lint
passed for the three changed TypeScript files. No browser run, network probe,
model call, independent review or full profile was repeated. Exact commit CI
supplies the normal repository checks.

This demonstrates removal of a dependency wait, not a measured browser or
production speedup. Earlier incomplete performance runs and over-budget samples
remain evidence; this change does not claim the complete #377 timing target or
generation-to-delivery latency has passed. Reverting this change restores the
same document assembly with deferred vendor reads; no persisted data changes.
