---
name: lingxiloop-verify-change
description: "Classify explicit LingxiLoop task paths and run only their direct local evidence while handing repository-wide regression coverage to CI. Use before claiming checks pass, pushing, handing off, or merging; also for 验证改动, 选择测试, 提交前检查, or 判断该跑哪些检查."
---

# Verify a LingxiLoop Change

Treat completed, merged, and previously verified work as the trusted baseline. Local verification covers only files edited again in the current task; CI owns repository-wide type, architecture, unit, integration, build, Eval, Compose, and packaging regression evidence.

## Classify the scope

Record every repository-relative path written or semantically conflict-resolved in the current task, then pass that exact list from the repository root:

```text
node .agents/skills/lingxiloop-verify-change/scripts/classify-change.mjs --path <file> [--path <file> ...]
```

- `--path` is repeatable and cannot be combined with range options. Read-only files and unchanged dirty-worktree files do not belong in the list.
- With no `--path` or `--base`, the classifier and fast runners intentionally select nothing and exit successfully instead of scanning the worktree.
- Use `--base <ref> [--head <ref>] [--include-worktree]` only for CI planning, an explicitly requested PR-range audit, or reproduction of that exact CI failure. Do not use a historical base to reverify completed local work.
- Use `--format json` when another tool needs the versioned report.
- Read the JSON `ci` object when planning automation. Package manifests, workflows, or selector changes still set `fullMatrix`; that changes the CI handoff, not the local task scope.

Read [references/check-matrix.md](references/check-matrix.md) before changing the classifier mapping or when a category needs manual interpretation.

## Select and run evidence

1. Inspect the task paths and their current-task edits. Add any written path omitted from the explicit list.
2. Run each `required` command, including its reported `args`, once. `test:local` selects only changed tests, direct sibling tests, explicit `--test` files, and the schema/bootstrap mapping.
3. When behavior has a non-sibling owning test, add it with repeated `--test <file>`; do not broaden to a feature, domain, or architecture suite.
4. Run `recommended` checks only when narrow and directly reachable. Treat `CI-only` checks as a handoff unless reproducing that exact failure or the user explicitly requests them.

Do not run fix-mode linters, rewrite generated files, start deployment workflows, or mutate Git as part of verification unless separately authorized.

## Keep verification lean

- Ordinary business files require changed-file lint and direct unit evidence only. Whole-graph typechecks and global guards run locally only when the classifier identifies their public/configuration/authoritative contract inputs.
- Never add architecture suites merely to prove the established V1 baseline. CI runs the global architecture and regression matrix.
- After merge or rebase, include only files with semantic conflict resolution or subsequent edits. A fast-forward or clean application does not invalidate successful evidence for unchanged work.
- If a successfully checked input has not changed, do not rerun its command. If it changes again, put it back in the task list.
- Never run full unit/integration, build, Eval gate, Compose, packaging, service provisioning, or credential-gated live tests as a default local gate.

## Report

Report:

- explicit task paths and changed categories;
- exact commands run, working directory when non-root, exit status, and relevant failure;
- recommended or CI-only checks handed to CI, without describing their absence as a local failure;
- the strongest remaining blind spot;
- `pass`, `fail`, or `incomplete` without overstating confidence.

Do not claim CI-owned coverage passed locally. Reclassify only the task paths that changed after a merge, rebase, or later edit.
