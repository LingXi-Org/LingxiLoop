# Issue 193 delivery failure model

Recorded before delivery code changes. The upstream implementation, runtime and
browser behavior have separate owning failure models and integration coverage.

- The source tree contains all 24 skill files but the image omits the skill,
  runtime, license, or vendor assets. Build both image stages with explicit
  vendored inputs; verify the fixed upstream hashes before building the SPA.
- A changed vendored file does not trigger owning CI checks or image publication.
  Include the vendor directory and its verifier in Web and server scope inputs.
- Retired OpenUI-only packages, environment variables, test selectors or fixture
  imports keep the old implementation active or make clean builds fail. Remove
  only exclusive inputs and keep shared message, authorization and chat features.
- Root and runtime dependency trees resolve different LingxiOS versions. Keep
  the existing exact 3.5.3 image assertions and verify both clean installations.
- Source checks pass while the deployed image has missing resources. Verify
  immutable image provenance and authenticated production readiness after the
  ordered Komodo rollout; do not reuse old release or endurance evidence.
- Migration or deployment changes lose retained data. Keep migration 0033 and
  old tables unchanged, use one additive forward-compatible migration, verify a
  snapshot-consistent backup by isolated restore, and record the rollback path.
- A successful workflow merely publishes an image without deploying it. Require
  a successful terminal Komodo update, actual A/B Web and Worker image digests,
  runtime/schema versions, and affected route checks.
