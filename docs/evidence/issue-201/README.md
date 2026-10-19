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
| Server `svix`, retired inbound-email dependency | `c7038be0` removed inbound email implementation and its imports; no current source/script consumer or lock parent besides server root | Remove server-only dependency closure; retain current WuKong HMAC verification and webhook replay/idempotency integration |
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

## Results

Pending implementation and final verification. No unrun check is counted as passed.
