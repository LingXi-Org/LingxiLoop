# Protocol, delivery, review and quote integration

This release combines the formally published runtime fixes from LingxiOS #46,
#47 and #48, and the product changes in #333, #336 and #337. The runtime release
candidate #49 passed exact-head CI 39903886733 (719 tests, real PostgreSQL and
cross-process checks, Worker image/package qualification). The main merge commit `8ccadfa265241e00a59ab01e7641ebabbb30b028` passed
CI 39905299928 and tag `v3.8.3` published successfully in 39906100771.
The product installs this exact registry package; both manifests/locks and the
actual tarball SHA-512 match, and native schema bytes remain unchanged.

The product explicitly sets `additionalContentCorrections: 3`. The two protocol
corrections, tool limits, cancellation and global call/token/cost/time ceilings
remain bounded. No request payload can change this option. The host transition
refuses incompatible unfinished bindings or checkpoints and performs one separate
provenance CAS after draining. Native14 and all 54 product migration files remain
unchanged; historical migration and model-index maintenance are not release steps.

Combination checks:

- Web tests: 123 passed. Server tests including model-operation trace: 127 passed.
- Web typecheck and the combined production Web build passed. Lint passed with existing warnings.
- Server typecheck passed with the actual formal 3.8.3 package.
- Current package profile checks passed 3/3. Real PostgreSQL patch checks passed
  5/5 with zero skips, including actual empty 0→54 initialization, repeat refusal
  to adopt mismatched provenance, partial-history refusal before DDL and the CAS
  transaction/unfinished-binding boundaries.
- The historical migration fixture runs 44 existing checks with the actual
  integrity-verified formal 3.8.2 archive and current source. This isolated fixture
  passed all 44 checks before integration; the final combined invocation and
  affected product runtime integration are running and remain merge gates.
  The exact candidate CI and final independent review remain merge gates.
- #337's independent browser evidence covers desktop/mobile, light/dark and quote
  behavior. Its seven unrelated full E2E typecheck errors were reproduced on the
  untouched base; this release does not claim a clean full E2E typecheck.
- Independent reviews of the final component commits and runtime combination
  reported no remaining P1/P2. The runtime patch tool #339 separately closed its
  exact-lock and partial-history findings before final review.

Measured runtime evidence is reproducible in the upstream repository. The joint
review's synthetic two-candidate scenario makes four actual model calls instead
of six; its prescribed clock changes last useful body to runtime commit from
330 ms to 30 ms while preserving truthful delivery checks. Six real development
provider cases passed with one measured joint review each. Protocol cases cover
mixed SSE delimiters and empty-answer recovery using the actual HTTP driver.
These results do not establish production completion rates, provider latency or
browser/IM completion latency. The original teacher conversation is not retried
by this release, and private production payloads are not published.
