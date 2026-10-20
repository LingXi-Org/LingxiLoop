# Runtime payload slimming failure model

Base: `535873b941815b41961a44f56e479257cbb71626`. Scope: development and draft PR only; no merge, package publication, deployment, production request or issue closure.

Before implementation, the owning boundaries are:

1. The SPA build needs the complete pinned ZCode source and provenance verifier. Narrowing that build-stage input would break the browser bundle; keep it unchanged.
2. The final server has two explicit filesystem consumers: `visualize-skill.ts` loads the full 24-file skill and its references/render helpers; `im/visualize.ts` serves the skill manifests/assets, the generated `gen-ui.js`, and the unchanged upstream `genUiTweakRuntime.js`. Missing any required runtime path must fail qualification.
3. The Python standalone export resolves bundled assets and vendor licenses relative to the full skill. Preserve every skill file, including examples, references and licenses, byte for byte; execute the real export from the packaged tree.
4. Upstream reference TypeScript/React/Electron source is build input and retained review material in Git. Removing it from the final stage must not remove source from the repository or the SPA build. Preserve upstream Apache license and source provenance in the image.
5. A static COPY/glob model can disagree with Docker. Measure the source payload with actual local BuildKit scratch COPY using the production Dockerfile-specific ignore rules; no image pull, RUN, tag or publication. Retain before/after inventories and hashes.
6. Startup source imports can pass in a checkout while files are missing from the package. Run the actual production Web/Worker launcher against the exported payload and preserved runtime dependencies. The no-credentials guard only proves import/link coverage, not database readiness or a final OCI image.
7. The `lingxiloop: file:..` server dependency may be a package consumer despite no static import. Inspect the full runtime import closure, dynamic imports, registry/skill/harness construction, migration and scripts, plus the exact npm dependency graph before removing it. Do not attribute the root frontend dependency tree to this link.
8. Dependency and payload measurements use identical inputs and deterministic file inventories. Byte changes to source payload, lockfiles and tar compression are separate from complete image size, bundle size, build duration and peak disk. Unmeasured metrics remain unverified.
9. Existing release blockers (the prior candidate's uncompleted final-image startup, and parked 216/219 checks) remain documented and are not resolved by this PR. Product schemas, dependency runtime version, authorization and source code behavior are unchanged.
