# LingxiLoop Verification Matrix

The classifier consumes explicit current-task paths. Completed commits and unchanged dirty-worktree files are a trusted baseline and are not local verification inputs.

## Categories

| Category | Typical paths | Local evidence | CI evidence |
| --- | --- | --- | --- |
| `docs` | root Markdown, `docs/`, project Skills | task-path lint/content; brand guard only for brand-bearing paths | classifier-selected matrix |
| `eval` | `eval/`, `server/src/eval/`, Eval tests/scripts/persistence, Eval UI | direct Eval tests | deterministic Eval gate, persistence integration, UI build |
| `frontend` | `src/`, `public/`, `website/`, Vite/Tailwind entry files | task-path lint and direct tests | typecheck, full unit suite, production build, global guards |
| `server` | general `server/` runtime | task-path lint and direct tests | typecheck, full unit and selected integration suites, global guards |
| `agent-os-im-canvas` | Agent OS, agents, IM, Canvas, message-stream seams | direct tests; guards only for authoritative contract inputs | reliability integration and Compose smoke |
| `database-tenant` | schema/bootstrap, DB pool, tenant/auth/onboarding and API persistence seams | direct tests and the schema/bootstrap mapping | bootstrap, tenant-negative, transaction, and full integration coverage |
| `workers` | `workers/` | changed-file lint and worker-owned focused tests | full unit suite and configuration-specific typecheck |
| `vendored` | `third_party/` | provenance inspection | provisioned vendor-scoped tests |
| `build-release` | workflows, Compose, Dockerfiles, package/version, Electron/mobile packaging | changed-file lint, version check, selector self-test | build, complete matrix, package/layout, and Compose smoke |

Categories overlap deliberately. `agent-os-im-canvas` and `database-tenant` are specialized views of server risk, not evidence that a change is automatically cross-domain.

The Eval fast path is fail-closed. It applies only when every path is Eval-owned: versioned suites/baselines, `server/src/eval/`, Eval-specific tests/runners, `src/admin/EvalPage.tsx`, the Eval Skill, or the Eval guide. Shared Agent OS, v1 schema/bootstrap, API/Admin shell, integration-runner, root config/docs, workflow, and classifier paths cannot prove hunk ownership and therefore restore their owning checks. Package manifests, workflows, and classifier changes set `ci.fullMatrix=true` so dependency and selector changes are exercised by the complete matrix before they are trusted.

## CI escalation rules

Require the full CI matrix when any of these applies:

- the reset-only v1 schema, bootstrap, or completeness check changes;
- workflow, dependency, package, Docker, Compose, version, or release machinery changes;
- the CI workflow or its change classifier changes;
- two or more primary runtime domains change in one diff;
- vendored source or provenance changes;
- the user explicitly asks for a full rehearsal or a CI failure is being reproduced.

Do not approximate that matrix locally. Local work is limited to explicit task-path lint, direct tests, selector self-tests, and a global check only when one of its canonical inputs changed.

## Selection details

- Pass the same repeated `--path` values to classifier, `lint:local`, and `test:local`. Add non-sibling owning tests with repeated `--test`; CI retains exhaustive unit coverage.
- A no-argument fast runner is a deliberate no-op. Use `--base` only for explicit range audit or CI reproduction, never as a routine post-merge local gate.
- Run `npm run test:eval` locally for Eval changes. CI runs `npm run eval:check`, combining frozen evaluator/harness replay with a deterministic current Agent OS runtime regression.
- CI runs `npm run test:integration:eval` for Eval schema, service, API, and persistence changes; it never serializes the full integration directory for an Eval-focused pull request.
- Run a local typecheck only when package/tsconfig, declarations, public contracts, or a composition entrypoint changes.
- CI runs `npm run test:integration` for schema, tenant authorization, durable work, IM routing, Host Bridge recovery, and multi-service persistence behavior. Locally run only an exact integration file when explicitly reproducing a CI failure.
- Run a global architecture, Agent OS, or LLM guard locally only when its guard, canonical contract input, or provider-call boundary changes.
- Run the Open Notebook native scope test from `third_party/open-notebook` when that vendor subtree or its integration changes.
- Treat production build, full unit/integration, `npm run mvp:ci:smoke`, and desktop directory packaging as CI-only unless the user explicitly requests the exact local rehearsal.
