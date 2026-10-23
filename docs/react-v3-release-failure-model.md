# Public text v3 release contract (#366)

This change qualifies a single formal runtime patch, with no DDL or new release
format. Public reader 3 reads historical v1/v2 and sealed v3 segments; producer
`purpose-json-v3` requires the reviewed 3.8.7-or-later 3.8 patch family and the
actual formal package capability. Version bounds do not replace package, source,
OCI-layer, installed-schema or deployment-leaf proof.

Failures to reject before stopping services:

- A 3.8.5/3.8.6 image claims reader/producer 3, or a v3 runtime still advertises
  reader 2; an unknown reader, producer, prerelease or major/minor is supplied.
- A producer skips v1 directly to v3, downgrades, or changes within an image-only
  release; its new behavior retains the old deployment-leaf hash.
- Actual package metadata, Worker model options, leaf hash, image/configuration,
  accepted source containers, native schema or any product migration differs.
- Any unfinished bound/checkpoint run exists, including waiting, delayed,
  cancelled or expired work. Do not rewrite its fingerprint, reset its budget,
  delete its binding or hand it to a different runtime to clear the barrier.

Execution and recovery failures:

- No service stops while images or prerequisite evidence are unavailable.
- The existing runtime-patch path stops all four services, waits naturally for
  leases, proves two zero barriers, and performs one non-DDL provenance CAS.
  Both new Web readers must become healthy before either new Worker starts.
- Full container configuration and the first observed container/image identities
  remain bound through health and final acceptance; replacement or drift fails.
- An unknown CAS is not replayed. A known unchanged source may use the existing
  explicit source-restoration contract. A committed CAS or newly bound v3 work
  requires fix-forward; an old runtime must not resume the new work.
- Historical migration gates remain exact. The new capability validation applies
  only to the current full54 profile and the explicit provenance patch.

Validation uses synthetic release transports and pure profile checks, including
source-v2 restoration, pre-CAS refusal, committed/unknown CAS outcomes and
exact v3 metadata. Existing isolated provenance integration coverage remains
responsible for the unchanged SQL locking/barrier/CAS implementation. No
production access or operation is part of these tests.

## Local validation (2026-10-23)

The failure model and new regressions preceded the implementation. The owning
command first reported 101 passing / 8 failing tests against the old contract,
then 109 passing / 0 failing after the change:

```sh
node --import tsx --test scripts/public-text-release.test.mjs scripts/host-release.test.mjs scripts/host-release-komodo.test.mjs server/src/__tests__/runtime-patch-profile.test.ts
```

`npm run server:typecheck`, lint for the three changed server files, and
`git diff --check` also passed. These checks used the unchanged formal 3.8.5
dependency installation; v3 capability cases are explicit synthetic descriptors
and transports. They do not claim a published 3.8.7 package, real provider
acceptance, production rollout or live database validation. Final integration
must bind the formally published package and real image capabilities before
any runtime patch operation.
