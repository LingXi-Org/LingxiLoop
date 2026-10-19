# CI and dependency maintenance — issue 201

Base: `088e269f36f63884b44704c3b0f1e27f1a6f76fc`. Independent branch
`codex/ci-maintenance-evidence`; no deployment, credential, security, migration,
AGENTS.md or fixed LingxiOS 3.5.3 soak changes. Application latency changes belong
to #196/#197. This report will record the final checks before handoff.

## Method and failure modes (recorded before implementation)

OpenAI's [Maintaining software with the GPT-6 family](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)
(Rodrigo Roim, 2026-10-14) informs the evidence-first audit: trace indirect
consumers and history, retain operational safeguards, measure CI costs and
prepare a small draft PR. The article's 63-test example adds a missing mock,
reducing 592.6s to 29.8s while retaining all tests; it does not justify deleting
slow coverage here. Repository-specific results below are independently measured.

Failure modes to check:

- A shared browser/server source edit selects only Web checks and misses server
  authorization, persistence or protocol regressions. Assert routing from the
  actual workflow paths, including the complete runtime copy/import graph.
- A dependency has indirect, CSS, dynamic, type-only, script or upstream
  consumers. Inspect tracked references, lockfile parents and removal history;
  retain candidates with such consumers or uncertainty.
- Lockfile regeneration upgrades unrelated packages or the runtime. Compare
  surviving package versions/resolved URLs/integrities and validate fresh installs.
- A cache optimization reuses an installed tree, skips validation, or changes
  release gates. Cache only npm's download store; retain clean `npm ci` installs,
  all owning checks and failed/cancelled deployment blocking.
- Dropping installation for a dependency-free job silently omits a needed CLI.
  Run the actual version-check command with no node_modules and inspect imports.
- Local warmed installs or a different CI scope look faster without equivalent
  work. Record environment, sample size and scope; do not claim a causal CI speedup
  from incomparable runs.

## Initial inventory decisions

| Candidate/category | Evidence | Decision / retained coverage |
| --- | --- | --- |
| Root `@tabler/icons-react`, unused dependency | No tracked consumer beyond manifests/lockfiles; last product import removed in `fc3f0991eaa2e8b646acff42309164b3ea808fa8`; no transitive parent in root lock | Remove declaration and unreachable lock entry; verify Web/Admin typechecks, tests and builds |
| Server `svix`, retired inbound-email dependency | `c7038be0c2493abd4a6c9ca5d1ccd372613413e5` removed inbound email implementation and its imports; no current source/script consumer or lock parent besides server root | Remove server-only dependency closure; retain current WuKong HMAC verification and webhook replay/idempotency integration |
| xterm, Tailwind Typography, scrollbar-hide | Pinned ZCode upstream `packages/ui/src/styles.css` imports/plugins and upstream manifest reference them | Retain; a top-level source-only grep is insufficient proof |
| Individual Radix packages / `lib0` / Tiptap core | Umbrella Radix, Yjs/Y protocols and Tiptap packages consume them transitively | Retain; deleting direct declarations does not prove installed-size benefit |
| `@types/*`, cross-env, wait-on | TypeScript ambient resolution or npm scripts are consumers | Retain |
| Historical migrations and retirement regressions | Existing database upgrades and rejected legacy protocol paths remain supported contracts | Retain every migration and test |
| Existing test files | Smoke lists are intentional; remaining tests can run on changes or owning integration/manual entrypoints | No test deletion or weaker assertion proposed |

## CI baseline

GitHub run [39264078273](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39264078273),
PR source `56f5f05b6b90cb0225b421c89f99915e7e100dd7`, succeeded with all six Node
install jobs selected. Install steps: Web 45s, Admin 24s, Control 32s, Server 48s,
deploy-contract 37s, integration 47s (233 runner-seconds total). Integration took
553s including its 473s test step. One sample, not a stable distribution.

Main run [39264147651](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39264147651)
at `bc6dd87d203496580914069d4854f8958692a196` had 334 install runner-seconds across
the same six Node jobs, demonstrating runner/network variation. Deployment-only
PR run [39264873174](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39264873174)
spent 23s installing and 38s in its deploy-contract job. These are historical
observations; they are not before/after claims.

Current caching combines root, server and eval lockfiles although these jobs
install only root. Web/Admin build duplication was already removed by previous
maintenance; do not claim that existing optimization as this change. PR runs
already cancel obsolete runs; main runs already serialize. Preserve both.

## Implemented changes and measured payload reduction

Implementation commit: `3096d7f999b4f7436e474c6f8a8bc27770718890` (author
`leecyang <164771957+leecyang@users.noreply.github.com>`). [Draft PR 203](https://github.com/LingXi-Org/LingxiLoop/pull/203).

- Remove root `@tabler/icons-react` and its exclusive `@tabler/icons` child; the
  current generator config selects Hugeicons. Remove server `svix` and its
  exclusive `standardwebhooks`, `@stablelib/base64` and `fast-sha256` children.
  These are the complete deletion list; no repository source/test file is deleted.
- Root installs cache only `package-lock.json`, not the unconsumed server/eval
  lockfiles, and prefer cached archives while still running `npm ci` and verifying
  lockfile integrity. Do not cache node_modules or disable npm auditing.
- The builtin-only release version check no longer installs root dependencies;
  Python-only checks no longer initialize Node. Existing Web/Admin build reuse,
  PR cancellation and main serialization remain intact.
- Route all copied shared server inputs (message/mention/activity contracts and
  Visualize shared modules) to server checks and full integration. The regression
  traces the actual Docker COPY inputs so future additions cannot silently miss
  those checks. This intentionally adds necessary coverage for those changes.

| Affected dependency closure | Before | After | Removed compressed archives | Removed regular-file payload |
| --- | ---: | ---: | ---: | ---: |
| Root lock entries | 1,693 | 1,691 | 4,658,269 B | 57,507,868 B / 23,342 files |
| Server lock entries | 352 | 348 | 191,766 B | 1,304,045 B / 1,172 files |

[dependencies.json](dependencies.json) records every package/version and verified
archive integrity. Run `python docs/evidence/issue-201/measure-dependencies.py`
from the repo root to reproduce without installing/executing package code.
Surviving versions, resolved URLs and integrity hashes are identical; no package
entries were added. The server lock's parent-link metadata also synchronizes four
dev dependencies already present in the baseline root manifest; it introduces no
new installed package. These are affected package payloads, not whole-node_modules
or final Docker image measurements. Final Web bundle size/equivalence is not yet
measured. No artifact or application-data directory was cleaned.

## Tests retained and slow-test investigation

[tests.json](tests.json) inventories 278 owned test/E2E files (excluding vendored
upstream and evidence). Exact file-hash duplicates: zero. New test files: zero;
deleted test files: zero; test cases added/deleted: zero. One existing contract
case gains assertions. This is a static inventory plus targeted semantic review,
not proof that every test has unique behavioral coverage.

[slow-tests.json](slow-tests.json) ranks the largest test durations from the
historical integration log. The 16.32s model-context test already intercepts model
requests in non-live mode and checks repeated compaction, the shared ledger,
continuity and once-only delivery. The 9.60s native-memory case checks real
versioned writes and HTTP/SSE replay. The 8.95s historical migration case checks
upgrade compatibility. The 5.79s homework deadline case intentionally holds a
real database authorization lock across a deadline; replacing its clock with a
mock would lose the regression. The 4.16s readiness case intentionally delays
its local HTTP fixture by 3.5s to reproduce the old 3s limit. Retain all of them.
No demonstrated missing mock or redundant fixture was found in these inspected
expensive cases; no speculative timer or assertion change was made.

Retained critical coverage includes `permission-policy`, `gateway-auth`,
`memory-scopes`, `llm-ledger`, `im-send-reconciliation`, `native-admission`,
`runtime-reliability`, `migration`, and production rollout/smoke contracts. The
ordinary tiers remain smoke + changed owning tests, full integration for server
source/shared contracts, and explicit deep/manual/live acceptance. No fake-green
skip, timeout increase, weaker assertion, database-test concurrency, or soak edit.

## Verification and timing boundary

[validation.json](validation.json) and [version-check.json](version-check.json)
record the completed local checks. Node 22.23.3 and the exact locked TypeScript
5.9.3 parser were used for the dependency-light contract:

- Original baseline: 18 passed, zero failures/skips.
- Added shared-path assertion before the workflow fix: 17 passed, one expected
  failure, exposing missed server/integration routing for `src/lib/mentions.ts`.
- After the fix: 18 passed, zero failures/skips. All publishing/deployment
  failed/cancelled gates still pass their existing assertions.
- Actual `npm run version:check` with no node_modules: consistent manifests exit
  0; deliberately mismatched VERSION exits 1. Workflow YAML and unchanged
  permissions/triggers/concurrency/deployment-gate comparisons pass.
- Fresh full baseline install **failed** after 41.736s: the injected npm token
  returned HTTP 401 for exact `@lyyzka/lingxios@3.5.3`. Credentials/configuration
  were not changed. The preinstalled 3.5.2 tree was not used to claim runtime,
  application-build or integration qualification. Only its exact matching
  TypeScript parser was used by the independent contract test.

| Historical run / scope | Initial queue | Wall execution | Sum of runner execution |
| --- | ---: | ---: | ---: |
| PR 39264078273 / six Node jobs | 4s | 568s | 1,005s (16.75 min) |
| Main 39264147651 / checks + image publish | 3s | 777s | 1,256s (20.93 min) |
| PR 39264873174 / deployment contract only | 3s | 52s | 49s (0.82 min) |

These scopes differ. Runner execution sums overlapping jobs and is distinct from
wall time and from GitHub's billed/rounded minutes. See [ci-timings.json](ci-timings.json)
and reproduce with `python docs/evidence/issue-201/collect-ci.py RUN_ID ...`.
At the recorded observation, exact implementation run
[39284844981](https://github.com/LingXi-Org/LingxiLoop/actions/runs/39284844981) was
still **queued**. Its started-at placeholders on queued jobs are deliberately
not counted as execution. Candidate wall/runner times, full-suite outcomes,
whole installed-tree size and image/bundle sizes remain unverified; no speedup
percentage or per-day savings is claimed. The workflow now logs installed-tree
bytes for subsequent comparisons. The release job saves exactly one full npm
installation per selected release scope; elapsed savings depend on observed
install conditions (historically 24–65s for the sampled root installs).

The integrator should wait for exact-commit CI and complete the clean-install,
build/integration and release qualification before merging/deploying. Retain this
draft state while those gates are pending. Roll back repository changes through
Git; there are no schema/data changes to undo.
