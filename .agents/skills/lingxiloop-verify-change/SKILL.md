---
name: lingxiloop-verify-change
description: "Classify a LingxiLoop diff and run the smallest credible verification set, escalating risky or cross-domain changes toward the CI matrix. Use before claiming checks pass, pushing, handing off, or merging; also for 验证改动, 选择测试, 提交前检查, or 判断该跑哪些检查."
---

# Verify a LingxiLoop Change

Select evidence from the actual outgoing scope. Local verification is deliberately fast: changed-file lint, affected type graphs, guards, and owning focused tests. Pull-request CI consumes the classifier's `ci` plan and owns full unit, integration, build, Eval, Compose, and packaging work; `main`, manual, and release callers own the exhaustive platform matrix.

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
2. Run every local `required` check once. `npm run test:local` selects changed tests, sibling tests, feature/domain-owned tests, and the small architecture contracts; pass explicit test files when the classifier cannot infer ownership. For a committed classifier range, use `npm run test:local -- --base <verified-ref>` and `npm run lint:local -- --base <verified-ref>` so the runners inspect the same merge-base range instead of guessing.
3. Run `recommended` checks only when they are still narrow and directly reachable. Do not expand a local verification turn into a repository-wide rehearsal.
4. Treat `CI-only` checks as a handoff. Run one locally only when the user explicitly requests it or when reproducing that exact failing CI job; prefer its focused file/scope instead of the full command.
5. Add a focused test when the classifier cannot name one but the changed behavior has an owning test. Do not use an unrelated green suite as proof.

Do not run fix-mode linters, rewrite generated files, start deployment workflows, or mutate Git as part of verification unless separately authorized.

## Keep verification lean

- Do not wrap a guard, classifier, or script in a second test when the same command already runs in the selected local or CI plan. Keep one owning invocation.
- Never run `npm test`, `npm run test:integration`, `npm run build`, `npm run eval:check`, Compose smoke, or desktop packaging as a default local gate. CI owns them. Do not start or rebuild Postgres, Redis, WuKongIM, Docker, or external-provider fixtures solely for local verification.
- Use `npm run lint:local` instead of repository-wide lint during iteration. Run full `npm run lint` only in CI or to reproduce its failure.
- Stop after one credible focused evidence set. Do not rerun an unchanged successful command merely because another category mentions it.
- Run Skill and classifier self-tests only when their implementation or test contract changes; unrelated product diffs must not pay that cost.
- Keep credential-gated live tests out of default suites. Give them an explicit command and include them only when the opt-in credential flag is present.
- Prefer one shared fixture reset operation over repeated per-table or per-resource setup. Optimize fixture mechanics before deleting behavioral coverage.
- Preserve tests for authorization, tenant isolation, transactions, durable work, public contracts, and reproduced regressions. Remove or combine tests only when they exercise the same boundary with no distinct failure signal.
- A clean fast path reports no expected skips. Record unavailable optional checks at handoff instead of registering them as routine skipped tests.

## Report

Report:

- resolved scope and changed categories;
- exact commands run, working directory when non-root, exit status, and relevant failure;
- recommended or CI-only checks handed to CI, without describing their absence as a local failure;
- the strongest remaining blind spot;
- `pass`, `fail`, or `incomplete` without overstating confidence.

Do not claim a check passed because it is configured in CI or because a broader command was expected to include it. Reclassify after a merge, rebase, or material working-tree change.
