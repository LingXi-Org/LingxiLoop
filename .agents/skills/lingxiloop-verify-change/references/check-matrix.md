# LingxiLoop Verification Matrix

The classifier uses paths as a deterministic first pass. Inspect diff content before accepting the result, especially when ordinary API or agent-service files add SQL, LLM calls, authentication, or model-visible text.

## Categories

| Category | Typical paths | Local evidence | CI evidence |
| --- | --- | --- | --- |
| `docs` | root Markdown, `docs/`, project Skills | brand guard and content inspection | classifier-selected matrix |
| `eval` | `eval/`, `server/src/eval/`, Eval tests/scripts/persistence, Admin Eval Dashboard | focused Eval unit tests, guards, affected typecheck | deterministic Eval gate, persistence integration, Dashboard build |
| `frontend` | `src/`, `public/`, `website/`, Vite/Tailwind entry files | changed-file lint, frontend typecheck, `test:local` | full unit suite and production build |
| `server` | general `server/` runtime | changed-file lint, server typecheck, guards, `test:local` | full unit and selected integration suites |
| `agent-os-im-canvas` | Agent OS, agents, IM, Canvas, message-stream seams | Agent OS/LLM guards, server typecheck, focused owning tests | reliability integration and Compose smoke |
| `database-tenant` | v1 schema/bootstrap, DB pool, tenant/auth/onboarding and API persistence seams | server typecheck and focused owning tests | bootstrap, tenant-negative, transaction, and full integration coverage |
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

Do not approximate that matrix locally. Local work remains the applicable subset of brand, architecture and ledger guards, changed-file lint, affected typechecks, classifier self-test, and owning focused unit tests.

## Selection details

- Use `npm run test:local` during development. If its path inference cannot see the owning regression, pass the exact `.test.ts` file explicitly; after committing, add `-- --base <verified-ref>` to inspect that merge-base range. `lint:local` accepts the same explicit base. CI retains `npm test` as the exhaustive unit entry point.
- Run `npm run test:eval` locally for Eval changes. CI runs `npm run eval:check`, combining frozen evaluator/harness replay with a deterministic current Agent OS runtime regression.
- CI runs `npm run test:integration:eval` for Eval schema, service, API, and persistence changes; it never serializes the full integration directory for an Eval-focused pull request.
- Run frontend typecheck locally when the Eval Dashboard changes; CI owns its production build.
- CI runs `npm run test:integration` for schema, tenant authorization, durable work, IM routing, Host Bridge recovery, and multi-service persistence behavior. Locally run only an exact integration file when explicitly reproducing a CI failure.
- Run `npm run guard:agent-os` for the active Agent OS composition and tool boundary.
- Run `npm run guard:llm-tracked` whenever a server-side cloud LLM call or its wrapper can change.
- Run the Open Notebook native scope test from `third_party/open-notebook` when that vendor subtree or its integration changes.
- Treat production build, full unit/integration, `npm run mvp:ci:smoke`, and desktop directory packaging as CI-only unless the user explicitly requests the exact local rehearsal.
