# Release-source cleanup (#551)

Baseline: `351e895a315bb46b9061c8628b20d9b9fa5ffa1e`. Owner: the cleanup PR integrator.
Scope: remove retired development surfaces and unused source, and narrow release inputs without changing the browser product or durable data.

## Decisions and consumers

- Removed the independent `eval/`, historical `e2e/` and `perf/` harnesses, their workflows, commands, dependencies and one-off scripts. Retained CI-selected product regressions, integration suites, migration fixtures and operational release contracts. Three homework documents used by an integration check moved into `server/src/__integration__/fixtures/homework/`.
- Retired Electron development, native window bridges, drag chrome, native icons and tooling. The browser remains the development and release surface; shared desktop-layout components remain in `src/desktop/`.
- Removed obsolete documents-view modules, orphaned server exports and wrappers, mock resources, and old starter-avatar images after tracing source imports and entrypoints. Historical starter-avatar URLs belonged to seeded agents; current agent avatars use the brand renderer and the agent repository returns a null avatar URL. User-uploaded and generated avatars remain supported.
- Archived historical evidence and experiment directories in Git history. Current documentation and skill links point to the fixed baseline where needed. Pinned vendor source, manifests, licenses, product migrations and current operating procedures remain.
- Removed unused direct dependencies and pruned their unreachable lock entries without changing any retained package version. Regenerated scoped manifests with `node server/scripts/scoped-dependencies.mjs --write`. Vitest remains for the control-plane Worker; Better Auth's optional peer also keeps it in the Web lock closure.
- Narrowed Docker context and final COPY inputs to server source/assets, exact root/server provenance manifests, required shared modules, the complete Visualize skill and its runtime helper. Full ZCode upstream remains a build input. Startup provenance, credentials, tenant authorization and migration gates are unchanged.

The independent pre-review caught the server manifest requirement: `server/src/db/runtime-profile.ts` reads both root and server manifests/locks. The final image retains all four files. The image's environment-guard startup check alone cannot verify DB-backed readiness.

## Measurements

Same Windows host, Node 22.22.2, same installed dependency tree and build commands. Bytes below are decimal, uncompressed; they are not network transfer or OCI layer sizes.

| Inventory | Baseline | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| Tracked files, excluding this new record | 4,521 | 2,733 | 1,788 (39.5%) |
| Canonical Git blob bytes, excluding this record | 67,622,744 | 46,604,103 | 21,018,641 (31.1%) |
| Root lock package entries | 1,787 | 1,663 | 124 (6.9%) |
| Test source files (`*.test.*`) | 543 | 226 | 317 (58.4%) |
| Built Web files | 1,282 | 1,273 | 9 |
| Built Web bytes | 73,690,045 | 62,444,067 | 11,245,978 (15.3%) |

Git inventories use `git ls-tree -rl` against the baseline and candidate index tree. Web inventories recursively sum `dist/`. The candidate was built from a fresh copy outside the user-directory Yarn configuration; it reused the baseline `node_modules`. Clean locked installs remain a CI check. Existing large-chunk warnings remain; optional renderers and document formats were not removed to manufacture a smaller product.

## Verification and limits

- Passed: Web build/typecheck, Admin build/typecheck, Server typecheck, Control typecheck; Web and Server lint (Web reports existing warnings, no errors).
- Passed: Web 131, Admin 8, Server 133 selected tests.
- Final combined packaging/model/selector/checkout checks: 43 passed, one could not run because the local Docker CLI lacks usable Compose (`unknown flag: --env-file`). That failure is the rendered A/B model-environment check, not a passing release qualification.
- Fixed two exposed Windows fixture issues: use the platform path separator when copying a historical migration prefix, and preserve checksum-sensitive fixture/CSS bytes through Git attributes. The 15 selector/checkout regressions passed. The moved PDF retains its binary attribute.
- No local Docker image build, DB/Redis integration execution, browser acceptance, production probe or rollout was performed. Image-byte savings are not claimed. CI results belong to the PR's exact commit and must be checked before merge/release.

Rollback is a Git revert and normal reviewed release; no data migration or data deletion is part of this change. Historical harnesses can be restored from the fixed baseline when a concrete regression needs them. Deployment requires separate authorization and the existing controller receipts and health checks.
