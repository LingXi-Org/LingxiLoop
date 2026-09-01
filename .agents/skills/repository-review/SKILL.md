---
name: repository-review
description: Perform a read-only, repository-aware review of LingxiLoop changes. Use for code review, regression review, release-readiness review, or verification reports where findings must be scoped, evidenced, and prioritized without modifying files.
---

# Repository review

Stay read-only. Freeze the requested diff, commit, or file scope before reviewing; do not silently expand into unrelated cleanup.

## Review

1. Read repository rules and trace changed call sites, data flows, deployment paths, and tests.
2. Prioritize correctness, data loss, authorization, tenant isolation, migration safety, retry/idempotency, public contracts, and missing behavioral coverage.
3. For each finding, provide severity, exact file/line evidence, the failing scenario, and the smallest corrective direction. Do not report style preferences as defects.
4. Check that deleted behavior has no remaining entry point and that new behavior is exercised through its public boundary.
5. Run only read-only validation appropriate to the scope and report commands not run or environmental limits.

Lead with findings ordered by severity. If there are no findings, say so and list residual risk or unverified gates. Do not edit, stage, commit, publish, or contact external systems.
