# Integration with production main

The reviewed source candidate is c04df0e6ac360d6910461d8105fd4e3d601d3f57.
It is combined with production main1bd9e539bea64d9bfd356d68c7dcf3e7e4fdbaff,
including releases694,695 and697. The only merge conflict is the integration
runner's live qualification/aggregate time budget. Preserve both the opt-in
single-file live Slides/artifact qualification and697's bounded allowance for
four named durable-queue owners; ordinary modes and per-file limits are retained.

Local scope/selector checks pass20/20 after linking the existing dependency cache.
The first run without node_modules failed three subprocess guard assertions;
the dependency-linked rerun passed. This local cache contains an older SDK and
does not qualify formal25 native behavior. Exact dependency CI is required.
That preparation retained the production source changes from c04df0e6; the follow-up below intentionally splits out its guidance changes.
All four real-provider samples remain partial; the earlier source evidence does
not establish stable speedup or real teaching acceptance.

## Pre-split release compatibility gate (b6782230)

The pre-split b6782230 candidate changes the registered Slides skill body in
`server/src/modules/artifacts/skills.ts`. The published formal25 harness includes
each skill index/hash in its fingerprint: `src/skills/definition.ts` hashes the
whole skill, and `src/harness/profile.ts` includes those indexes when assembling
the harness. Formal25 `src/app/index.ts` rejects an admitted work item whose
pinned harness differs, before loading its context. The corresponding upstream
source is the qualified formal25 commit8a4657d584eefdb16fc9ef7e4973d93488686d7a.

The current SDK is already3.8.25. In the existing deploy controller,
`preflightPublishedRuntimePatch` returns `complete:true` for that installed target,
and `convergeRuntimePatch` then calls ordinary target convergence directly. This
does not perform the held-admission/all-nonterminal-zero cutover documented in
`docs/visualize.md` under "In-flight runs and release gate" for a changed harness.
Normal Worker drain alone does not hold both old APIs' admission throughout a
rolling A/B update. An old admitted pin can therefore reach a new incompatible
Worker even though both deployments use the same SDK and product schema.

Before this full candidate can be released, a supported release path must hold
source admission, preserve/drain queued/leased/waiting work on its pinned source,
and establish global zero while admission remains held before target admission.
Pre-cutover refusal must retain the old compatible source and queued data;
after target admission, recovery must remain compatible with the target harness.
No pin rewrite, implicit cancellation, old-record deletion, credential/security
change or SDK provenance rewrite is a substitute for this gate.

This merge preparation does not implement or execute that missing cutover path.
PR696 remains unmerged. Production697 is verified healthy; its container/public
checks do not establish the696 gate or production IM/SLA acceptance.

## Compatible follow-up

The guidance-only changes are now deferred, rather than releasing a changed harness through ordinary convergence. `skills.ts` and the added design_systems description sentence match main exactly; the new-resource typography fix and compatible CAS diagnostics remain. See [HARNESS-COMPATIBILITY.md](HARNESS-COMPATIBILITY.md) for both actual fingerprint layers, the exact source capture, native pin regression and remaining boundaries. No release gates are changed or bypassed, and no production deployment is started. Historical older-cache checks above do not qualify this follow-up: its checks use the exact installed formal25 package.
