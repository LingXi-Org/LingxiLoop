---
name: lingxiloop-code-review
description: "Perform a read-only, repository-aware review of a LingxiLoop working tree, staged diff, commit range, branch, or pull request. Use for code review, PR review, merge-safety assessment, 审查代码, 检查改动, or 合并前检查; report evidence-backed findings without modifying code or Git state."
---

# Review LingxiLoop Changes

Review the requested change against current product contracts and shipped behavior. Prefer a small number of proven defects over speculative warnings or style commentary.

## Freeze the scope

1. Identify the requested mode: working tree, staged diff, explicit commit range, branch, or PR.
2. Record the exact base and head. Verify supplied refs locally or from live PR metadata. Never guess, fetch, switch branches, or mutate the checkout merely to obtain a base.
3. Include untracked or local changes only when they are part of the requested scope. State anything excluded.
4. Read the complete diff. When output truncates, inspect changed files individually.

For a local classification of affected subsystems and relevant checks, run the sibling verifier in a matching scope mode:

```text
node .agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs [scope options]
```

The classifier is evidence for coverage selection, not a substitute for semantic review.

## Establish the contract

Read `README.md` and `CONTRIBUTING.md`, then only the architecture documents that own the changed behavior. Read nested `AGENTS.md` files before reviewing vendored Open Notebook code. Treat tests and history as behavioral evidence, not automatic product authority.

Read [references/review-contract.md](references/review-contract.md) for LingxiLoop-specific risk surfaces, severity, and output requirements.

Trace both sides of every changed interface and enough callers, callees, persistence, and failure paths to establish reachability. Distinguish a verified defect from an unanswered product question.

## Review the change

Prioritize:

- incorrect results, crashes, lost or cross-tenant data, authorization bypass, and unsafe external effects;
- ordering, retry, lease, fencing, idempotency, transaction, cancellation, and partial-failure regressions;
- broken Agent OS, WuKongIM, Host Bridge, model-visible, migration, packaging, or vendored-source contracts;
- tests that cannot fail for the changed behavior, especially around security, concurrency, recovery, and migrations.

Do not re-report issues already conclusively enforced by a passing repository gate unless the gate is bypassed or incomplete for this path. Do not demand unrelated refactors, speculative generality, or formatting preferences.

Run focused, non-mutating checks only when they materially strengthen a claim or close a coverage gap. Record the exact command and result; never infer that an unrun check passed.

## Report

For each accepted finding, state the defect, tight location, reachable impact, governing contract, evidence, and a concrete correction direction. Use Codex `::code-comment` directives for localized findings with priority `0` through `3`; keep cross-cutting findings in the summary.

Return findings in severity order, then list coverage, checks run, and explicit blind spots. If no actionable findings remain, say so without inventing one. Keep the review read-only: do not edit, stage, commit, push, post a GitHub review, or resolve threads unless the user separately authorizes that action.
