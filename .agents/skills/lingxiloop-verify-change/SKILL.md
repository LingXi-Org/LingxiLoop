---
name: lingxiloop-verify-change
description: "Classify a LingxiLoop diff and run the smallest credible verification set, escalating risky or cross-domain changes toward the CI matrix. Use before claiming checks pass, pushing, handing off, or merging; also for 验证改动, 选择测试, 提交前检查, or 判断该跑哪些检查."
---

# Verify a LingxiLoop Change

Select evidence from the actual outgoing scope. Pull-request CI consumes the classifier's `ci` plan, while `main`, manual, and release callers own the exhaustive platform matrix. Local verification must exercise the narrowest check that would fail for the changed behavior.

## Classify the scope

Run the read-only classifier from the repository root:

```text
node .agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs
node .agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs --base <verified-ref> [--head <ref>] [--include-worktree]
```

- With no `--base`, inspect staged, unstaged, and untracked paths only.
- With `--base`, compare the verified merge base to `--head` or `HEAD`. The script never guesses or fetches a base.
- Add `--include-worktree` only when local changes belong to that committed range.
- Use `--format json` when another tool needs the versioned report.
- Read the JSON `ci` object when planning automation. `evalFocused` is fail-closed and valid only when every path is Eval-owned. Shared runtime/DB/API/integration files restore their owning checks; package manifests, workflows, or classifier changes set `fullMatrix`.

Read [references/check-matrix.md](references/check-matrix.md) before changing the classifier mapping or when a category needs manual interpretation.

## Select and run evidence

1. Inspect the classified paths and diff. Correct any path-only false positive or content-level omission before selecting checks.
2. Run every available `required` check once.
3. Run `recommended` checks when the behavior is reachable, the escalation applies, or the user requests stronger confidence. A missing database, Redis, Docker, platform, or credential is a recorded limitation, not a pass.
4. Treat `CI-only` checks as a handoff unless the user requested a full local rehearsal and the environment supports it.
5. Add a focused test when the classifier cannot name one but the changed behavior has an owning test. Do not use an unrelated green suite as proof.

Do not run fix-mode linters, rewrite generated files, start deployment workflows, or mutate Git as part of verification unless separately authorized.

## Report

Report:

- resolved scope and changed categories;
- exact commands run, working directory when non-root, exit status, and relevant failure;
- recommended or CI-only checks not run and why;
- the strongest remaining blind spot;
- `pass`, `fail`, or `incomplete` without overstating confidence.

Do not claim a check passed because it is configured in CI or because a broader command was expected to include it. Reclassify after a merge, rebase, or material working-tree change.
