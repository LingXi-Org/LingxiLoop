# Scoped npm dependency isolation (#442)

Baseline: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d`, Linux x64,
Node 24.19.0 / npm 11.9.0 host checks; CI and Docker use Node 22.
Independent review omitted by explicit user instruction. No production actions.

`server/scripts/scoped-dependencies.mjs` generates install-only manifests and
locks under `server/build/` from the committed root graph, without registry
resolution. Run `node server/scripts/scoped-dependencies.mjs --write` after
changing root dependencies; run it without arguments to fail on drift.
`node --test server/scripts/scoped-dependencies.test.mjs` checks nested dependency
resolution, mandatory peers, optional platform packages, missing dependency
failure, and prohibited Web tool families. Versions, resolved URLs, integrity,
platform constraints and nested layout are copied unchanged. Optional peers
present in the original graph stay present. Full `npm ci` development remains
supported; original scripts/test lists are unchanged.

For a clean scoped install from a disposable checkout, run:
`node server/scripts/install-scoped-dependencies.mjs web --cache /path/to/cache`.
The helper temporarily selects the profile, runs `npm ci --ignore-scripts
--prefer-offline` with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, then restores root
manifests in `finally`, including on npm failure. Avoid concurrent npm commands
in the same checkout. CI keeps its original lint/typecheck/build/test commands.

## Consumer boundaries

SPA Web retains browser dependencies, Vite/TypeScript/Biome/tsx, and visualize
esbuild plus MCP runtime. LingxiOS is required by actual `src` imports of `/ui`,
HarnessContext and shared-state types; its published transitive runtime stays
intact. Backend-only root entries, Electron/E2E, Cloudflare/workerd, and shadcn
CLI are excluded. The exact shadcn4.19.0 runtime stylesheet is vendored with MIT
license and hash/version guard because `globals.css` imports it. `tsconfig.json`
now explicitly supplies ES2023 library declarations for existing `findLast`
consumers, which previously depended on ambient libraries from unrelated tools.

Admin extends Web with Refine, react-router and OpenPlait analytics. Control
uses Hono, Better Auth, Drizzle, MCP, Zod and its Cloudflare test/deploy toolchain.
Web CI extends SPA Web with dotenv, pg and ioredis because the existing
run-updates smoke test imports server identity -> pool/Redis projections.
Server CI retains the server runtime, TypeScript/Biome/tsx and the React/Tiptap
consumers reached through server test/typecheck imports. Deploy-contract needs
LingxiOS metadata/runtime, pg (module-mocked shadow tests), and TypeScript for its contract-source parser.
Integration adds the visualize esbuild/MCP runtime to server CI. Admin-control
combines the two required production deploy consumers. Release version checking
uses builtins and installs no packages; Notebook remains independently managed.

| Profile | Locked packages (all platforms) |
| --- | ---: |
| web | 1085 |
| web-ci | 1086 |
| admin | 1101 |
| control | 431 |
| server-ci | 739 |
| deploy-contract | 94 |
| integration | 754 |
| admin-control | 1265 |

## Verification and measurements

Clean isolated installations use separate caches. Apparent bytes (`du -sb`),
not OCI compressed bytes; no runner-time savings are claimed. Intermediate
failed installs are not reported as successful. Host logs are retained at
`/tmp/lingxi-442-*.log`, checkouts in `/workspace/441-442-checks/`.

| Clean installation | node_modules bytes | npm cache bytes |
| --- | ---: | ---: |
| Web | 1,115,460,968 | 279,396,211 |
| Server CI | 671,821,823 | 195,110,109 |
| Web CI | 1,115,564,868 | 279,588,527 |
| Admin | 1,128,083,409 | 281,850,191 |
| Control | 746,330,144 | 217,905,712 |
| Deploy-contract | 223,788,175 | 64,756,946 |
| Integration | 689,883,799 | 199,207,669 |

Passed: generated drift check and both focused graph regressions; clean SPA Web
install and Vite production build (60s), explicit Web typecheck and lint;
Web CI clean install and127/127 smoke tests; clean server install, lint/typecheck
and129/129 existing smoke tests; clean admin install, lint/typecheck, tests and
production build (6.75s); clean control install, lint/typecheck and13/13 Worker
tests; deploy-contract original core batch and effective-candidate check plus
46/46 shadow PG tests; integration clean install plus visualize verification
(223 files) and runtime build (173 inputs,633011 output bytes). License copied
into generated SPA `dist/licenses/shadcn.txt` was verified.

Control Worker tests explicitly disable automatic SPA PostCSS config loading,
which previously pulled the unrelated Tailwind pipeline into the worker job.
`WRANGLER_LOG_PATH` was redirected to a writable temp path for host verification.
Admin-control's generated union profile is drift-checked, but its deployment
commands were not executed. No live integration databases were provisioned;
only dependency installation and the integration job's visualize entrypoints
were checked. CI on Node22 and Docker OCI checks remain with the integrator.

Failed attempts retained: private package401 with one existing credential;
subsequent clean installs used the other existing authorized credential.
An early temp checkout lacked Git history required by deploy-contract tests;
rerun uses the shared repository's object history. Temp filesystem exhaustion
interrupted an install; checkouts were moved to the larger workspace filesystem.
A helper was mistakenly invoked in the shared root; root manifests were restored
and a full locked reinstall was started to restore node_modules. Initial full
reinstall failed on a mirror503; cached retries hit mirror/public-registry503. Root manifests are restored;
full node_modules restoration remains blocked by14 nonoptional locked tarballs
(and2 optional nonhost nested sharp packages) unavailable through both original
mirror URLs and canonical registry URLs. The partial root full installation is
not a valid completed baseline. Exact cache: `/tmp/lingxi-442-root-restore`. Docker before/after
OCI evidence is owned and recorded separately by the integrator.
