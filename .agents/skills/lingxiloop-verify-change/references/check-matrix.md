# LingxiLoop Verification Matrix

The classifier uses paths as a deterministic first pass. Inspect diff content before accepting the result, especially when ordinary API or agent-service files add SQL, LLM calls, authentication, or model-visible text.

## Categories

| Category | Typical paths | Minimum evidence |
| --- | --- | --- |
| `docs` | root Markdown, `docs/`, project Skills | brand guard and link/content inspection |
| `frontend` | `src/`, `public/`, `website/`, Vite/Tailwind entry files | lint, frontend typecheck, owning tests; build when bundling or runtime entry behavior changes |
| `server` | general `server/` runtime | lint, server typecheck, owning unit tests |
| `agent-os-im-canvas` | Agent OS, agents, IM, Canvas, message-stream seams | Agent OS and LLM ledger guards, server typecheck, focused unit tests, reliability integration |
| `database-tenant` | migrations, DB pool/schema, tenant/auth/onboarding and API persistence seams | server typecheck, migration/unit coverage, tenant-negative integration, full integration suite when schema or persisted contracts change |
| `workers` | `workers/` | lint, worker/root tests, worker typecheck or build when its configuration changes |
| `vendored` | `third_party/` | closest nested instructions, provenance checks, scoped upstream/native tests |
| `build-release` | workflows, Compose, Dockerfiles, package/version, Electron/mobile packaging | version check, lint/typecheck/build as applicable, package/layout or Compose smoke in supported environments |

Categories overlap deliberately. `agent-os-im-canvas` and `database-tenant` are specialized views of server risk, not evidence that a change is automatically cross-domain.

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
- Run `npm run test:integration` for schema, tenant authorization, durable work, IM routing, Host Bridge recovery, or multi-service persistence behavior when PostgreSQL and Redis are available.
- Run `npm run guard:agent-os` for the active Agent OS composition and tool boundary.
- Run `npm run guard:llm-tracked` whenever a server-side cloud LLM call or its wrapper can change.
- Run the OpenBot vendor guard when a manifest-tracked file or its manifest changes.
- Run the Open Notebook native scope test from `third_party/open-notebook` when that vendor subtree or its integration changes.
- Treat `npm run mvp:ci:smoke` and desktop directory packaging as CI-only unless the local services and platform are already prepared.
