# SPA image packaging failure model (before implementation)

Base: 0e93870f196f0c01ddf90f1c76ffc9bc6d722391. Isolated branch fix/pr227-spa-vendor-package.

1. Checkout build succeeds because pinned assistant-ui range.ts exists, while Docker spa-build COPY never includes its subtree. Materialize the actual SPA COPY layout (including Dockerfile-specific context exclusions), reuse existing dependencies, and run the real npm build (tsc and Vite). Preserve missing-module red output. This is a stage-layout reproduction, not a built final image.
2. Adding COPY alone still fails because Dockerfile.dockerignore excludes that source. A packaging contract must independently consider COPY and ordered context patterns, and follow relative/alias TypeScript imports into third_party. Removing either fix must fail.
3. Future transitive relative dependencies inside a copied vendor subtree are omitted. Traverse actual resolved source imports rather than assert a single string/path. Package any imported vendor subtree with its existing LICENSE, SHA256SUMS and pinned README; do not change upstream bytes or import behavior.
4. A vendor-only change skips Web checks/image publication. Test actual workflow path filters for source, LICENSE and pin ledger, then run the package contract in the owning Web gate (also present in deploy-contract).
5. Broadened context accidentally includes unrelated vendored products/dependencies. Allow only assistant-ui/streaming-text subtree, retain all current exclusions. No all-third_party COPY/allowlist.
6. Local stage is not exact Docker image: explicit dependency symlink and host Node22, no Docker base pull/build, registry change or security relaxation. Final immutable image imports, migrations and health remain pending the separate image gate.

No UI source, manifests, runtime versions, schema or deployment state will be changed. No provider or production access. Git author/committer is existing leecyang.
