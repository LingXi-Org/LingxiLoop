# Runtime verification

Use the isolated fixture database (never a product database). Migrate with the existing `npm run db:migrate` entrypoint first. The runtime integration needs the normal server environment; local nonsecret fixture values may be supplied for the required server settings. No live provider is called by the deterministic fixtures.

```
npm run test:integration -- --file visualize-runtime.test.ts --file visualize-generation.test.ts --file visualize-teacher.test.ts --file runtime-nonthinking.test.ts
npm run server:typecheck
```

Real provider + official browser evidence uses the existing integration runner with `LINGXIOS_LIVE_VISUALIZE=1`, `OPENAI_MODEL=zai-org/GLM-5.3-Flash`, request timeout 180000, a dedicated `lingxiloop_issue193_live_test` database, API 5194, worker 5196, Redis /4, and the real isolated WuKong fixture. Inject the provider key with `/workspace/.lingxi-production/env.sh` and `lingxi-prod model-run`; never write or print it.

```
lingxi-prod model-run npm run test:integration -- --file visualize-live.test.ts
```

The live test invokes `node e2e/visualize/run-live-browser.mjs` after the generated response reaches durable IM. It saves the real model fragment, manifest, official browser report, interaction evidence, original-render.py standalone HTML, and shared-ledger counts under `E2E_VISUALIZE_LIVE_OUTPUT` (default `.e2e/visualize-live`). This is a product integration fixture; it does not modify the independent black-box Eval package.

The inline resource host accepts up to 5,000,000 UTF-8 bytes, matching the upstream service. The unchanged upstream `scripts/render.py` independently limits standalone source fragments to 1,000,000 bytes. Larger inline fragments must be simplified before export; the adapter reports that explicit limit and does not bypass it or modify the vendored skill. The owning runtime integration checks the rejection boundary.
