# Project slimming (#547)

Baseline: `7424a10210a4f82c32ff893945f98c4f37e78fef` (2026-10-29).
Scope: current source checkout and completed Git workspaces; no production rollout.

## Consumer decisions

| Candidate | Evidence and decision |
| --- | --- |
| Old Memos editor/toolbar and unused UI/viewer wrappers | TypeScript import reachability from application and tool entries, plus independent static/dynamic import audit: no retained consumers. Keep Markdown/tag grammar, live viewers and Worker URL entries. |
| Old attachment preview helper/test | Only the unused AttachmentViewer imported it. Remove that helper and its private test together; current viewer and browser coverage remain. |
| Open Notebook full product | Docker builds only the RAG entry; Python import closure and current tests do not use old frontend, chat, podcast, AI management or prompts. Keep RAG, shared storage/validation and every historical migration. |
| Historical generated results | Remove screenshots, videos, traces, copied HTML and result files. Keep written evidence, authored benchmark/verification scripts, synthetic oracle, VM manifest, native event fixture and release planner templates. See [evidence recovery](evidence/README.md). |
| Root dependencies | Remove 17 unused direct dependencies after tracing consumers. Regenerate scoped manifests from the existing lock; retained package versions do not change. Keep Mantine peer dependencies and the third-party visualization dependencies. |

Observed baseline: 9,933 tracked files / 283,182,205 bytes. The deletion set
removes 5,415 files / 215,249,014 bytes, before small documentation and lock
changes (about 76% of checkout bytes). This includes 84 Web source/test/style
files and 404 retired Open Notebook files. This is checkout maintenance;
Git history remains intact and no production bundle/latency saving is claimed.

The root lock drops from 1,804 to 1,787 package entries. The Python lock drops
from 244 to 92 packages. No retained package version changes in either lock.

## Verification

- `npm run lint`: passed, with existing warnings; no automatic fixes.
- `npm test` with `CI_TEST_FILES=["src/lib/sensitiveInteractionIntegration.test.ts"]`: 134 passed, zero skipped.
- `npm run build`: passed (including Web typecheck, pinned visualization verification and runtime build).
- `npm run admin:build`: passed (including Admin typecheck).
- `node --test server/scripts/scoped-dependencies.test.mjs`: 2 passed.
- `node server/scripts/scoped-dependencies.mjs`: generated profiles match the root lock.
- Open Notebook `uv run --frozen --python 3.12 pytest -q`: 115 passed, 17 skipped, both before and after removal. The skipped shadow migration cases need a dedicated SurrealDB fixture.
- Browser flows were not executed. The additional E2E typecheck has errors in the retained suite; baseline comparison is recorded in the PR.

Initial local checks hit stale TypeScript/runtime installations. Dependencies
were restored with the repository's lockfiles, then the owning checks above
were rerun. The scoped generator also requires the pinned shadcn CSS's original
LF bytes; the local checkout was normalized without changing its Git content.

## Git cleanup and recovery

Delete branches only when their exact tip is an ancestor of main, or matches a
merged PR whose merge commit is an ancestor of main. Remote deletions use exact
SHA leases. Keep open PRs, unique tips, dirty worktrees and the initialization lock.
Before removal, create and verify a full local Git bundle. Preserve non-cache
ignored files separately. On Windows, detach junctions without traversing their
targets before removing a worktree; the initial cleanup exposed this Git hazard
and the shared dependency installation was restored afterward.

Local backup and per-ref/per-worktree receipts are outside the repository at
`E:/lyyzka/LingxiLoop-cleanup-backup-20261029/`. Restoring a source directory
from the baseline commit reverses any deletion; no product data or schema
migration was modified.
