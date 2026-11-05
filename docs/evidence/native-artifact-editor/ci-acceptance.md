# Real full-application CI acceptance

`Native artifact acceptance` is a manually dispatched, non-`main` branch workflow.
Before its filename is registered on the default branch, dispatch the existing
`LingxiLoop CI` workflow on the candidate branch with
`scope=native-artifact-diagnostic` (or `native-artifact-paired`). That dedicated
scope calls the reusable acceptance workflow and skips normal change detection,
checks and deployment paths. It uses a separate concurrency group so normal PR
checks cannot cancel an in-progress measurement. Direct dispatch is also supported
once the new workflow is registered; merging is not needed for the CI entry path.
It neither publishes images nor deploys. This setup is separate from the isolated
HTTP-fixture UI tests: the browser uses the actual built product, API, PostgreSQL,
Redis, WuKongIM, and control-plane Worker/D1/Better Auth sign-in. No product routes,
SDK implementations, authentication responses or model requests are mocked.

The baseline is exactly `d004312841026a4d90dfbd9e8292a55cc29a2e95`, including its
original lock and published `@lyyzka/lingxios@3.8.25`. The candidate uses its own
lock and authorized `@lingxi-org/lingxios@4.0.0`. Both production applications are
built independently before measurement. The existing verified historical runtime
bootstrap prepares baseline product62; the frozen application then checks that
database. The candidate follows the formal SDK4/product63 migration chain.

The job uses only fresh, dedicated local services:

- PostgreSQL `127.0.0.1:25432`, databases `native_artifact_baseline_test` and
  `native_artifact_candidate_test`; bootstrap refuses to reuse existing databases.
- Redis `127.0.0.1:26379`, isolated databases 1 and 2.
- Actual WuKongIM built from the repository's pinned upstream and raft fix, API
  `127.0.0.1:25001` and WebSocket `127.0.0.1:25200`.
- MinIO `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z` on `127.0.0.1:29000`,
  with a fresh `native-artifact-candidate-test` bucket created through the AWS S3
  API and fixed test-only credentials. Inherited storage configuration must match
  these exact local settings; production endpoints and credentials are rejected.
- Separate HTTPS product origins `localhost:24411` / `localhost:24412`, with the
  existing isolated editor origins and a per-run certificate/SPKI exception.
- Pinned Python Playwright 1.55.0 and its managed Chromium, on Ubuntu 24.04.

First dispatch `phase=diagnostic`. It attempts one real sample for each arm and
Design/Slides mode, including both opening paths supported by the runner. A
diagnostic can succeed operationally, but **never qualifies performance gates**.
Inspect its actual readiness, saved-edit acknowledgements and traversal results.
If it fails, fix the reported stage and repeat on the new candidate commit.

Only after a successful diagnostic may the sole integrator dispatch
`phase=paired`, supplying `diagnostic_run_id`. The guard checks that GitHub run's
exact candidate SHA, one of the two reviewed workflow paths, manual event,
diagnostic title, and successful conclusion before installing or measuring. It
also verifies the exact unexpired diagnostic artifact and its recorded phase,
commits, completed checkpoint and eight passed arm/mode/opening-path samples. A
generic successful CI run is insufficient. A diagnostic from another revision or
an isolated UI test cannot unlock the ten alternating pairs. Qualification still
depends on all required measurement fields and thresholds in the benchmark.

Package credentials are bound only to dependency installation and formal database
bootstrap. Measurement strips package/GitHub tokens before launching services.
No model key is injected; the provider endpoint is closed loopback and the fixture
refuses inherited provider credentials. Candidate Slides uploads all 50 PNGs via
the actual authenticated `/api/artifacts/:id/assets` route, persists the returned
URLs through `asset.set`, and reads them through the permission-checked product API
and local S3 storage. Fixture asset IDs, dimensions and byte hashes are unchanged.
Frozen Slides uses its real grant routes and PostgreSQL file bytes. These are the
respective product storage paths, not identical storage implementations. Both
Design arms retain matching local HTTP image routes. No external CDN, paid model
generation or production-network performance is claimed.

The private arm JSON necessarily contains the ephemeral test session cookie. It,
TLS keys, profiles, downloaded exports and raw service/browser output stay under
the protected runner temporary directory and are removed in cleanup. The uploaded
`results.json` is an allowlist projection: numeric measurements, booleans, fixed
labels and commit hashes. It retains individual network records at editable/idle/
stable checkpoints with exact transferred/decoded byte counts, timing, status,
cache/finish flags, decoding evidence, target type and a one-way resource hash;
full PSS observations, export sampling and raw numeric sample metrics remain.
Browser version and Linux platform strings pass strict format checks; structured
OS, distribution, kernel, architecture, Node and expected/installed SDK versions
are recorded separately. A fixed `NATIVE_ARTIFACT_PUBLIC_RECEIPT` log line contains
the same safe environment, summaries, gates and principal per-sample measurements,
without the full network records. Authorized log readers can inspect actual
results without an artifact-download workaround.
Raw URLs, arbitrary error messages, source, prompts and
credentials are excluded. Only explicitly named runner screenshots are copied;
no temporary directory or raw log is uploaded. Check annotations contain fixed
phases/codes, sample counts and qualification booleans only.

HTML export validation also launches a separate Chromium process after the export
memory sampler has stopped. It opens the actual downloaded `file://` document with
an empty context, offline networking and HTTP(S) requests denied; no HTTP mirror
is substituted. The check requires 50 actual page headings, decoded images,
rendered formulas and ready fonts, and records compact `offlineHtml` observations.
The verifier closes before subsequent measurements. A file-policy refusal or
missing resource is a failed observation, never a claimed offline pass. The local
preparation checks only parse this code; execution evidence must come from the
hosted full-product diagnostic.

Local orchestration checks:

```sh
node --check scripts/native-artifact-ci.mjs
node --check scripts/native-artifact-serve.mjs
node --test scripts/native-artifact-ci.test.mjs
node --test scripts/native-artifact-storage.test.mjs
```

These checks validate setup/privacy/dispatch contracts. They do not establish
successful full-product startup or measured performance; only the dispatched
real-service run can supply that evidence. Locally blocked package/log domains
are not accessed through alternate transports by this workflow preparation.
