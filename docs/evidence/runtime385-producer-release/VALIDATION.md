# Producer v2 release tooling validation

Scope: three release-tool modules and their existing offline contract tests. No product deployment leaf, package lock, runtime implementation, credentials, production configuration or database operation was changed.

The initial v2 regressions were written before implementation: 94 tests, 88 passing and 6 expected failures. The minimal producer contract change made all 94 pass. Following the recovery call chain exposed a source/target metadata assumption; two additional tests failed before the recovery fix (42/44 passed), then the related four suites passed 117/117.

Final validation on Node 24.19.0:

```
node --test --test-reporter=tap scripts/production-rag-contract.test.mjs scripts/release-smoke.test.mjs scripts/schema-upgrade-maintenance.test.mjs scripts/schema-upgrade-host-source.test.mjs scripts/host-release.test.mjs scripts/host-release-model-config.test.mjs scripts/host-release-stopped-recovery.test.mjs scripts/host-release-image-recovery.test.mjs scripts/host-release-lease-wait.test.mjs scripts/public-text-release.test.mjs scripts/current-source52-acceptance.test.mjs scripts/host-release-transport.test.mjs scripts/host-release-komodo.test.mjs scripts/verify-memory-backup.test.mjs
```

Result: **239 passed, 0 failed, 0 skipped**. `git diff --check` passed. The first broad attempt lacked this isolated worktree's dependency tree; after reusing the existing checkout dependencies, those two import failures were resolved and the full command above passed. No registry installation or package publication was performed.

The source-restoration correction checks the original producer/options/deployment leaf only after the existing exact receipt, source provenance, four original identities and no-unknown-outcome gates permit restoration. Successful target CAS remains fix-forward; no gate is removed.

These are synthetic release-tool tests. They do not qualify runtime 3.8.4 or claim that runtime 3.8.5 is published or deployable. The integrator must still bind the actual formal 3.8.5 package, all four locks, exact successful final-product CI, source acceptance, all-layer image audit, actual publicText2/runTrace1 and exact target leaf/model options. Production execution remains exclusively with the parent task.
