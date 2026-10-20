# PR222 packaged-startup regression

Base: `0a7fd57cca2e4d203a217a27f95882af5e3d2fd5` (published source `035a8e11f4f092e6d6535dd4455cbc32c3a5f743`, PR222 head `a944de96`). Local runtime: Node `v22.23.3`; reused installed dependencies with LingxiOS `3.5.6`. No production, provider, database, or Redis access was used.

The production error path supplied by operations was `/app/src/lib/participantDisplayName`, imported from `/app/src/lib/mentions.ts`. PR222 added that shared runtime dependency but the final Docker COPY list did not include its file. The extensionless source import also did not follow the `.js` convention used by the other shared server imports. The checked-in production launcher is **tsx**, not bare Node TypeScript. Fixing only the extension would leave the file absent.

A second gap let this through: server-source changes published the image without scheduling the existing import-graph deployment contract. The fix schedules that contract, includes the new shared helper in server ownership, and checks all server-reachable `src/` shared imports (including Gen UI), not just `src/lib/`.

## Evidence

- Before changing product code, bare Node importing baseline mentions failed with `ERR_MODULE_NOT_FOUND`; both actual tsx Web/Worker entrypoints failed with the same missing helper when run against a directory assembled from the final-stage COPY source list. `red.json` reports only exit status and boolean matches; `contract-red.log` records both the existing graph failure and the new routing assertion failure.
- After the fix, native Node type-stripping imports the dependency-free helper successfully. Both packaged tsx entrypoints finish static linking and then stop at the existing **missing DATABASE_URL** environment guard. `entrypoint-green.log` is **link coverage, not successful service startup or readiness**.
- Deployment contracts + release smoke: **22/22** (`contracts-green.log`). Mention regression: **11/11** (`mentions-green.log`). Web/server typecheck, focused Biome lint, and `git diff --check` passed.
- Static review of all copied shared modules found no other runtime extensionless relative imports or missing transitive shared files. `participantDisplayName.ts` has a type-only `../types` import, erased at runtime; it does not require copying browser types into the image.

## Reproduce the package-directory boundary

With Node 22 and installed repository dependencies:

```sh
node docs/evidence/pr222-startup/stage-package.mjs "$PWD" /tmp/pr222-package-check
cd /tmp/pr222-package-check
node --experimental-strip-types --input-type=module -e 'await import("./src/lib/participantDisplayName.ts")'
node server/scripts/check-packaged-startup.mjs
```

Use a fresh output directory. The staging helper copies the relevant final-stage source paths and links the existing dependency installation. It does **not** claim to recreate the full image, production-only dependency installation, SPA, or readiness. The checked-in Dockerfile runs the native helper import and the same Web/Worker linker smoke **inside the actual final image stage after all COPY operations**, with an empty child environment and dotenv disabled. No credentials or service connectivity are needed for these checks.

## Unverified release gate

Local full-image validation was blocked before build: pulls of the configured Node image and the public ECR Node mirror returned registry rate-limit errors. No security settings or credentials were changed, and no alternative base image was substituted. Full image build/publish and real Web/Worker startup/health remain for the sole release integrator. Do not interpret the intentional missing-environment exits as passing health checks. The final-stage smoke will fail the image build on this missing-file regression; actual post-build service readiness remains separately required.
