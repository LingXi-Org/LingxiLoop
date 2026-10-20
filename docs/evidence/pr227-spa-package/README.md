# PR227 SPA packaging correction

Base: `0e93870f196f0c01ddf90f1c76ffc9bc6d722391`. Only image input packaging, CI ownership and packaging checks change. UI implementation, upstream bytes, manifests/locks, runtime3.5.6, runtime schema12 and product migration46 are unchanged.

The production StreamingText imports the pinned official `third_party/assistant-ui/streaming-text/upstream/utils/range.ts`. The Docker SPA stage copied only third_party/zcode and its Dockerfile-specific context excluded assistant-ui. A checkout build therefore could not qualify this image filesystem. The new dependency graph contract finds this actual transitive import; the real copied-layout build independently fails with TS2307 at streaming-text.tsx:9 (and three downstream implicit-any diagnostics).

The fix copies only the existing assistant-ui/streaming-text subtree into the SPA stage and allows precisely that subtree through the context. Its pinned README, checksums, complete upstream source and MIT license are preserved. The final runtime stage also places the unmodified MIT license at `/app/dist/licenses/assistant-ui-streaming-text.txt`. CI vendor-only source/license/pin changes now select Web/image publication; Web runs the SPA package contract even when main skips the duplicate checkout build. The existing deploy-contract job also runs this contract.

| Evidence | Result |
| --- | --- |
| `contract-red.log` | Before product fix: packaging graph and real workflow ownership 0/2 pass, missing range + missing Web owner |
| `contract-red-final.log` | Refined placement/CI-gate assertions before fix: 0/2 pass |
| `red-layout-build.log` | Real npm build in old SPA COPY/context layout: exit2, 17.513s, exact TS2307 missing range |
| `green-layout-build.log` | Same dependency install, fixed SPA layout: npm prebuild + web/node TypeScript + Vite exit0, 57.620s |
| `missing-copy-red.log` | Remove only new SPA COPY: contract exit1, missing range detected |
| `missing-context-red.log` | Remove only new context allowance: contract exit1, missing range detected |
| `license-red.log` | Before final-image license COPY: contract exit1 |
| `contracts-final-green.log` | Production/package/CI/release-smoke contracts 23/23 pass, 0 fail/skip/cancel, 2.376s |
| `lint.log` | Web lint exit0; existing 5 warnings + 2 infos, no fixes applied |
| `upstream-hashes.log` | All 3 upstream source/license hashes match existing SHA256SUMS |

The first attempt (`red-build.log`, 0.514s) failed in prebuild because existing dependencies had been relocated to `/tmp/pr220-root-node_modules-20261020`, breaking esbuild's package self-resolution. This is an environment failure, not the product red. It remains preserved. Subsequent red/green runs use the unmodified existing `/workspace/LingxiLoop-release-213-218/node_modules`; that owner's package-lock is byte-identical to this base (SHA256 `066ce021b285dc3ec0922b22138d1e79d05a2a311a5112bfa0f3421ef6ab1cdb`). No npm install or shared-dependency change occurred.

`stage-build.mjs` materializes explicit COPY destinations and the ordered Dockerfile-specific allow/exclude patterns from tracked inputs, hashes every staged file, symlinks existing dependencies, then executes actual npm run build under Node22.23.3. The green stage was materialized before adding the final-stage-only license COPY; its SPA instructions and every SPA input are identical to the final patch. Three input manifests and all earlier failed logs remain unchanged. `receipt.json` records final packaging/source/evidence hashes; `.codex-tmp/spa-*` retains the local layouts without committing build outputs.

Reproduction from an isolated checkout with the normal existing lockfile install:

```sh
source /workspace/.lingxi-production/env.sh
node --test scripts/production-rag-contract.test.mjs scripts/release-smoke.test.mjs
node docs/evidence/pr227-spa-package/stage-build.mjs unique-label
```

The helper refuses to replace prior stage evidence. For the baseline red, retain the new test/reproduction scripts and restore only Dockerfile, its .dockerignore and ci.yml from the base SHA. For each independent omission mutation, remove only the relevant new SPA COPY or context allowance and run the SPA image test. Restore before the final green.

This is not a final Docker image build or startup/health result. No base/image pull, production access, provider call, security change, merge or deploy was performed. Parent must obtain exact final CI/published image digest; the separate immutable-image Node/import + normal migrations + Web/Worker health gate remains pending. A container sandbox rejection must remain a failed/unverified Worker gate.
