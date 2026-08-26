# LingxiLoop Verification Matrix

The classifier uses paths as a deterministic first pass. Inspect diff content before accepting the result, especially when ordinary API or agent-service files add SQL, LLM calls, authentication, or model-visible text.

## Categories

| Category | Typical paths | Minimum evidence |
| --- | --- | --- |
| `docs` | root Markdown, `docs/`, project Skills | brand guard and link/content inspection |
| `eval` | `eval/`, `server/src/eval/`, Eval tests/scripts/persistence, Admin Eval Dashboard | focused Eval unit tests, frozen harness plus deterministic Agent OS runtime gate, server typecheck; focused Eval integration for persistence and frontend build for Dashboard |
| `frontend` | `src/`, `public/`, `website/`, Vite/Tailwind entry files | lint, frontend typecheck, owning tests; build when bundling or runtime entry behavior changes |
| `server` | general `server/` runtime | lint, server typecheck, owning unit tests |
| `agent-os-im-canvas` | Agent OS, agents, IM, Canvas, message-stream seams | Agent OS and LLM ledger guards, server typecheck, focused unit tests, reliability integration |
| `database-tenant` | migrations, DB pool/schema, tenant/auth/onboarding and API persistence seams | server typecheck, migration/unit coverage, tenant-negative integration, full integration suite when schema or persisted contracts change |
| `workers` | `workers/` | lint, worker/root tests, worker typecheck or build when its configuration changes |
| `vendored` | `third_party/` | closest nested instructions, provenance checks, scoped upstream/native tests |
| `build-release` | workflows, Compose, Dockerfiles, package/version, Electron/mobile packaging | version check, lint/typecheck/build as applicable, package/layout or Compose smoke in supported environments |

Categories overlap deliberately. `agent-os-im-canvas` and `database-tenant` are specialized views of server risk, not evidence that a change is automatically cross-domain.

An Eval change may deliberately span its suite, runtime trace producer, migration/API persistence, Dashboard, package scripts, workflow, and repository Skills. When every changed path is an Eval-owned path or listed Eval support seam, the classifier emits `ci.evalFocused=true`, suppresses cross-domain/full-matrix escalation, and selects only the owning Eval checks. A genuinely unrelated path breaks that focus and restores normal escalation.

## Escalation rules

Recommend a full CI approximation when any of these applies:

- a runtime migration or latest-schema sentinel changes;
- workflow, dependency, package, Docker, Compose, version, or release machinery changes;
- two or more primary runtime domains change in one diff;
- vendored source or provenance changes;
- the user explicitly asks for a full rehearsal or a CI failure is being reproduced.

The local approximation is the applicable subset of brand, architecture and ledger guards; version check; lint; frontend/server typechecks; unit tests; integration tests; build; native Open Notebook scope test; Compose smoke; and desktop package layout smoke. Do not pretend platform- or service-dependent checks ran when they did not.

## Selection details

- Use direct owning test files when the relationship is clear. Otherwise run `npm test`; do not guess a narrow test from a similar filename.
- Run `npm run test:eval` and `npm run eval:check` for Eval changes. The first is focused unit evidence; the second combines frozen evaluator/harness replay with a deterministic current Agent OS runtime regression.
- Run `npm run test:integration:eval` for Eval schema, service, API, and persistence changes. Do not serialize the full integration directory for an Eval-focused pull request.
- Run frontend typecheck and `npm run build` when the Eval Dashboard changes.
- Run `npm run test:integration` for schema, tenant authorization, durable work, IM routing, Host Bridge recovery, or multi-service persistence behavior when PostgreSQL and Redis are available.
- Run `npm run guard:agent-os` for the active Agent OS composition and tool boundary.
- Run `npm run guard:llm-tracked` whenever a server-side cloud LLM call or its wrapper can change.
- Run the OpenBot vendor guard when a manifest-tracked file or its manifest changes.
- Run the Open Notebook native scope test from `third_party/open-notebook` when that vendor subtree or its integration changes.
- Treat `npm run mvp:ci:smoke` and desktop directory packaging as CI-only unless the local services and platform are already prepared.
