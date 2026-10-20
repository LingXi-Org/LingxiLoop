# #229 server dependency audit

Reviewed repository: `LingxiLoop` at `535873b941815b41961a44f56e479257cbb71626` (2026-10-20 UTC).

## Finding / minimal candidate

**P3 / maintenance — remove the unused local self-dependency `lingxiloop: file:..` from `server/package.json:25`, with its three lockfile records.** This is the only dependency-removal candidate supported by this audit. Its effect is a small metadata/link cleanup, not meaningful package-tree slimming. Do not describe it as removing the frontend dependency tree or claim MB/image/build savings.

Smallest owning edit, on the parent's isolated branch:

- Delete `dependencies.lingxiloop` from `server/package.json`.
- Delete `packages[''].dependencies.lingxiloop`, `packages['..']`, and `packages['node_modules/lingxiloop']` from `server/package-lock.json`.
- Leave every real dependency/version/integrity untouched, including the published LingxiOS 3.5.6 qualification and root manifest/lock.

### Why this has no identified consumer

1. **Entrypoints and AST imports.** `server/package.json:6-9` directly launches `tsx server/src/bin/web.ts`, `tsx server/src/bin/worker.ts`, and `tsx server/src/migrate-bin.ts`. A TypeScript AST scan covered 407 non-test server source/script files and recursively followed 411 files from those three entrypoints plus `server/scripts/check-packaged-startup.mjs`. It includes imports, re-exports, literal dynamic imports, require calls, import.meta.resolve, and type imports (a conservative superset of runtime edges). There are no `lingxiloop` or `lingxiloop/*` specifiers; no nonliteral dynamic import/require/import.meta.resolve calls were found; no relative import in the closure failed resolution. All other 21 declared server dependencies occur in this closure. Four `@assistant-ui/react` edges in shared/projection files are type-only, so they do not establish a runtime React dependency and are not evidence of hidden frontend package use.
2. **Explicit runtime tool/skill registration.** `server/src/agent-runtime/tools.ts:16-20` combines locally imported tool definitions. `harness.ts:8-23,25-45` builds local skill/capability objects; `harness.ts:39` uses `id: 'lingxiloop'` as an identifier. `runtime.ts:100-102` passes this profile directly to `assembleHarness` / `createLingxiOS`. Installed LingxiOS is 3.5.6; inspected `node_modules/@lyyzka/lingxios/dist/src/harness/profile.js:5` reads `profile.id`, sorts supplied capabilities, hashes their objects, and returns the supplied definitions. It does not resolve a package from that ID. There is no matching `lingxiloop` string in that package's compiled JS. This checks the dynamic-registration concern separately from static source search.
3. **Scripts and subprocesses.** Root `package.json:6` points `main` to Electron's `electron/main.cjs`, supplies no `bin`, `exports`, or workspaces, and exposes no runtime package/plugin API through the self-dependency. The package name is not a CLI binary provider. Server subprocess inspection found the explicit Python visualization exporter (`visualize-export.ts:16-18`) and bubblewrap readiness command (`runtime.ts:221-224`), not a self-package launcher. Migration directory enumeration loads SQL files, not dependency plugins. `server/scripts/check-packaged-startup.mjs` resolves `tsx/cli` directly.
4. **Lock/install topology.** `server/package-lock.json:3229-3232` records `node_modules/lingxiloop` as `{ resolved: '..', link: true }`; the parent manifest is lock metadata under `packages['..']` starting at line 35. No other locked package declares a dependency/optional dependency/peer dependency on `lingxiloop`; only the server lock root does. Search across existing root node_modules package.json files also found no such consumer. Existing server/node_modules is absent, and resolving `lingxiloop` from the server manifest using createRequire gives `MODULE_NOT_FOUND` in the existing root-node_modules layout. This latter probe is resolution evidence, not an application startup pass.
5. **Container layout.** `server/docker/lingxiloop-server.Dockerfile:29-36` uses `/app` as WORKDIR and installs the server manifest there; the root manifest is copied only to `/tmp/qualified-package.json`. Thus `file:..` describes the parent directory `/` in that stage, not the repository root package. No valid runtime package API is supplied by that path. The final image gets `/app/node_modules` and the server manifest. This makes the link packaging debt rather than a legitimate way to consume the root frontend package. Do not claim the existing image build necessarily fails: no image was built in this audit.
6. **History.** `git blame server/package.json:25` and `git diff f4108e8ec^1 f4108e8ec -- server/package.json` show the self-dependency was introduced by merge `f4108e8ec3201473dfbcd0648f3c075c7dbd761f` (“merge: preserve education tenancy and prepare isolated native production”, 2026-09-12). Relative to its first parent the dependency was added; the accompanying combined lock diff promotes previously extraneous parent-manifest metadata and adds the link. No explanatory consumer or package API was established by that history. This supports 'unexplained merge-era residue', not certainty about author intent.

### Independent lock verification and bounded benefit

Used the installed npm Arborist `loadVirtual()` **offline only**, with separate baseline/candidate manifest+lock copies under `/tmp/issue229-lock-audit/`. No npm install, ci, reify, registry lookup, build, or image pull occurred.

- Baseline virtual inventory: 348 nodes.
- Candidate virtual inventory: 346 nodes.
- Removed: parent-manifest metadata at `..`, symlink at `node_modules/lingxiloop`.
- Remaining 346 nodes: same location, name, link flag, resolved URL, and version.
- Root dependency edge errors: empty in both inventories.
- Server lock does not have `node_modules/react` or `node_modules/@assistant-ui/react` installed-package records. Its metadata mention under `packages['..']` does not mean those are in the image dependency tree.
- Exact lock text: baseline 183,173 bytes; proposed minimal removal copy 177,447 bytes; reduction **5,726 text bytes**. This is lockfile JSON size, not compressed image size, installed node_modules bytes, network transfer, or build-duration improvement.

The virtual-tree check shows this edit preserves all actual locked dependencies; it is not a replacement for candidate npm-ci or packaged process import checks.

### Risk and owning validation path

Residual risk is low but nonzero: this is a static/read-only audit using the existing root node_modules, not the candidate production install layout. A future module could intentionally start resolving the self-package; an unusual npm configuration/install-links setting could alter local-link behavior. This repository does not specify such a package API; normal Node parent resolution and explicit installed dependencies already serve the runtime.

For a final candidate, parent should preserve the recorded import/virtual-tree checks and run the existing **credential-free, local** `server/scripts/check-packaged-startup.mjs` against a production-only package/install layout when available. It must reach the expected missing-DATABASE_URL guard for both Web and Worker, with no MODULE_NOT_FOUND/SyntaxError. The existing Dockerfile already runs it after all runtime COPY operations. A server dependency install/build should be owned by normal CI/final exact-commit review rather than claiming the root development install proves packaged behavior. An isolated migration-entry import check can likewise stop at the missing-environment guard; do not execute migrations or connect services. Feature smoke (tool registration, observability, file/avatar, Web and Worker paths) remains an application/CI gate. No production readiness, rollout, integration DB, or provider check was run or implied here.

## Why there is no second candidate

Each remaining direct dependency has a concrete owner in the traversed entrypoint closure:

| Dependency | Example consumer |
| --- | --- |
| @aws-sdk/client-s3 / @aws-sdk/s3-request-presigner | server/src/storage.ts:15 / :19 |
| @dicebear/core / @dicebear/styles | server/src/modules/identity/profile-avatar.ts:2 / :3 |
| @lyyzka/lingxios | server/src/db/migrate.ts:4 and agent-runtime/runtime.ts:1-2 |
| @openplait/core | server/src/modules/platform-operations/observability-dashboard.ts:1 |
| @opentelemetry/api / openlit | server/src/lingxilit-observability.ts:1 / :10 |
| assistant-stream | server/src/agent-runtime/assistant-transport.ts:1 |
| cheerio | server/src/modules/research/search.ts:1 |
| compression / express | server/src/web.ts:3 / :2 |
| dotenv | server/src/db/pool.ts:1 |
| ioredis | server/src/redis.ts:1 |
| mdast-util-from-markdown | server/src/modules/cases/application.ts:2 |
| openai | server/src/llm.ts:1 |
| pg | server/src/db/migrate.ts:3 |
| tsx | package scripts and server/scripts/check-packaged-startup.mjs:10 |
| ws | server/src/ws.ts:4 |
| yjs | server/src/modules/documents/collaboration-application.ts:17 |
| zod | server/src/modules/identity/contracts.ts:1 |

Removing/replacing these would require feature changes or separate ownership/behavior analysis; it is not an evidence-backed smallest dependency cleanup.

## Reproducible evidence and scope

- `/tmp/issue229-import-audit.cjs` — AST scanner, existing TypeScript parser; writes JSON evidence.
- `dependency-imports.json` — complete import edges and closure summary.
- `/tmp/issue229-lock-audit.cjs` — offline Arborist comparison; writes only `/tmp` copies and JSON evidence.
- `dependency-virtual-trees.json` — complete baseline/candidate virtual inventories and diff.
- `/tmp/issue229-lock-audit/{baseline,candidate}/app/{package.json,package-lock.json}` — baseline and proposed minimal candidate copies.

Read AGENTS.md and `.agents/skills/repository-review/SKILL.md`; latest parent scope overrides prior release authority. Repository was never modified. Existing dirty compose manifests and UI evidence/config remained untouched. No branch, PR, production access, deployment, publishing, issue closure, install, full build, DB mutation, or image pull performed. #216/#219 untouched. Final git status matched the initial status (two pre-existing modified deploy compose files and pre-existing UI artifacts/config).

No action was denied or has an uncertain execution outcome. Remaining validation above is intentionally unrun in this read-only subtask, not an access blocker.
