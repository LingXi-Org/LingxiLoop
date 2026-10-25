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

Web retains browser dependencies, Vite/TypeScript/Biome/tsx, and visualize
esbuild plus MCP runtime. LingxiOS is required by actual `src` imports of `/ui`,
HarnessContext and shared-state types; its published transitive runtime stays
intact. Backend-only root entries, Electron/E2E, Cloudflare/workerd, and shadcn
CLI are excluded. The exact shadcn4.19.0 runtime stylesheet is vendored with MIT
license and hash/version guard because `globals.css` imports it. `tsconfig.json`
now explicitly supplies ES2023 library declarations for existing `findLast`
consumers, which previously depended on ambient libraries from unrelated tools.

Admin extends Web with Refine, react-router and OpenPlait analytics. Control
uses Hono, Better Auth, Drizzle, MCP, Zod and its Cloudflare test/deploy toolchain.
Server CI retains the server runtime, TypeScript/Biome/tsx and the React/Tiptap
consumers reached through server test/typecheck imports. Deploy-contract needs
LingxiOS metadata/runtime and TypeScript for its contract-source parser.
Integration adds the visualize esbuild/MCP runtime to server CI. Admin-control
combines the two required production deploy consumers. Release version checking
uses builtins and installs no packages; Notebook remains independently managed.

| Profile | Locked packages (all platforms) |
| --- | ---: |
| web | 1085 |
| admin | 1101 |
| control | 431 |
| server-ci | 739 |
| deploy-contract | 80 |
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
| Deploy-contract (initial, before adding TypeScript) | 199,715,690 | 60,202,253 |

Passed: generated drift check and both focused graph regressions; clean Web
install, visualize source verification (223 files) and runtime build (173 inputs,
633011 output bytes); server lint/typecheck and original smoke test suite.
Web Vite build, admin/control/deploy-contract full job commands and integration
runtime checks are being finalized; update this record with their final results.
No live integration databases were provisioned for this dependency-only change.

Failed attempts retained: private package401 with one existing credential;
subsequent clean installs used the other existing authorized credential.
An early temp checkout lacked Git history required by deploy-contract tests;
rerun uses the shared repository's object history. Temp filesystem exhaustion
interrupted an install; checkouts were moved to the larger workspace filesystem.
A helper was mistakenly invoked in the shared root; root manifests were restored
and a full locked reinstall was started to restore node_modules. Initial full
reinstall failed on a mirror503; cached retry is in progress. Docker before/after
OCI evidence is owned and recorded separately by the integrator.
