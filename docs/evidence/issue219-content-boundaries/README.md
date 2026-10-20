# #219 criteria and private recovery boundaries

Base: `dc4bc88b81f0b9011c7540e4dc7f0889cab23778`. This patch changes neither migrations nor dependency versions. The earlier independent red evidence is retained byte-for-byte; `prior-red-preserved.json` records its hashes.

## Behavior

Legacy homework criteria are an array of plain-text items. They now initialize one official BlockNote paragraph per item, preserving internal newlines and literal Markdown characters. A matching native document still loads its original blocks. Initial typing, save, reopen, formatting, and another save retain the two semantic criteria and the unchanged first native block.

A private answer may keep its original `legacyMarkdown` for recovery while the current native content is B. Report/model input and learner/teacher text tools now explicitly project the current text, links and attachment manifest. Shared submissions keep the complete current native blocks, sections and projection, excluding recovery-only metadata. The repository applies the same shared projection to previously stored snapshots without rewriting those rows. Private draft recovery remains present. Existing revision, report hash, idempotency, authorization, explicit file manifest and transaction checks are unchanged.

## Evidence and scope

- `browser-red/`: actual HomeworkDraftCard and ContentEditor at the frozen base, official tester-army/e2e engine; **2 failed criteria cases, 1 passed recovery case**, no setup errors. Both criteria saves merged two items into one actual captured PATCH. `browser-green/`: same three assertions **3/3 passed** after the product fix. Both plain and multiline/literal criteria save and reopen as two native blocks. Private A remains in recovery metadata while current native blocks contain B.
- `payload-red/`: **5 failed, 1 passed**. `payload-green/`: **6/6 passed**. The probe executes the actual AST-extracted production model payload/private serializer, submission INSERT parameters, submission read function and text-tool projections. It imports the real schema and helper, captures the model request without a provider, and supplies a synthetic repository row. It is supplementary boundary evidence, **not** complete worker, SQL, authorization or HTTP acceptance.
- `browser-native-first/`: the unchanged original four native regressions plus new three cases produced **6 passed, 1 failed**, no setup errors. The failure was the original formatting case's final mobile selection/colour-toolbar assertion. Its desktop formatting, links, emoji and table operations had passed. A separate corrected frozen-base source-overlay run of that same original case passed **1/1** (`browser-native-baseline/`). Do not erase or combine these attempts into a false first-run pass; the final candidate result is recorded below.
- Web build (including Web/Node typechecks), server and E2E typechecks, and affected-file lint passed. Type errors initially found in new test code were corrected (JSON response narrowing, optional document narrowing and JSON-serializable browser evaluation return values); initial logs remain. The browser assertion logic is unchanged by those type corrections.
- New real HTTP/PG coverage is appended to `server/src/__integration__/homework.test.ts`. It covers report projection, real submit snapshots/idempotency, reading a synthetic historical row, peer/outsider access and retention of owner recovery. **It has not executed**: the normal candidate migrator rejects the missing real migration 47 before connecting (`expected 47, found 48`, `connections: 0`; `migration-preflight.log`). No placeholder, skipped migration, schema workaround or live database mutation was used. Run the owning integration file after the integrator includes the actual #216 migration.

The browser fixture uses real production components and native BlockNote 0.56 with a synthetic HTTP endpoint. It does not replace the editor/provider; it exposes the existing private HomeworkDraftCard export through a Vite test transform. Native attachment/permissions/events are unchanged and have not received new live DB acceptance here. No production or real model provider calls occurred.

## Harness corrections retained

1. Initial model probe import stopped at the missing DATABASE_URL guard (`payload-red.log`); that is a setup failure, not a product red. The first AST extraction had two harness errors (`payload-harness-initial/`); the corrected probe produced all five actual privacy reds before the product patch.
2. The shared dependency symlink put BlockNote fonts outside Vite's default filesystem root. The final fixture explicitly allows the actual local dependency directory. Earlier successful boundary tests used fallback fonts; no product security setting was changed.
3. The first frozen-source overlay was injected after the TypeScript transform and caused a Vite parse error. That attempt was stopped and retained in `browser-native-baseline-setup/` and its logs. Moving the fixture plugin to Vite's `pre` phase fixed the harness; the corrected original-case baseline passed. This setup failure is not counted as a product regression.
4. Existing PostCSS/large-bundle/CSS warnings and the environment's proxy warning remain in raw logs. They did not fail the build. No unsafe browser flags, direct Playwright API, credentials, new dependencies or production calls were used.

## Reproduction

Use Node22 and the installed locked dependencies. Start `node e2e/content-boundaries/serve.mjs` (default loopback port 5391), then run:

```sh
CONTENT_BOUNDARY_OUTPUT=.codex-tmp/reproduce-boundaries E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config e2e.content-boundaries.config.ts
CONTENT_BOUNDARY_NATIVE_REGRESSION=1 CONTENT_BOUNDARY_OUTPUT=.codex-tmp/reproduce-native E2E_TELEMETRY_DISABLED=1 node_modules/.bin/e2e run --config e2e.content-boundaries.config.ts
BOUNDARY_PROBE_OUTPUT=.codex-tmp/reproduce-payload node --import tsx docs/evidence/issue219-content-boundaries/boundary-probe.mjs
node --import tsx docs/evidence/issue219-content-boundaries/migration-preflight.mjs
```

The preflight deliberately exits 2 with the frozen candidate's real migration dependency. Browser result trees are unchanged copies; any `.codex-tmp/...` artifact links in their reports identify the original run paths. The baseline overlay uses `git show BASE:src/features/content-editor/{ContentEditor.tsx,document.ts}` into a private directory and `CONTENT_BOUNDARY_BASELINE=<directory>` for the fixture only. All other native-entry source modules and the original four assertions are unchanged from base.

The browser cache is retained at `/workspace/.cache/ms-playwright` per the parent's resource instruction: chromium 393MiB, headless shell 261MiB, ffmpeg 4.9MiB. Tests reuse it; no cleanup or relocation is implied. The final fixture process is stopped after testing.

## Final candidate observation

The final corrected-fixture combined run (`browser-final/`) is **6 passed, 1 failed, 0 skipped, 0 setup errors**, 50.94 seconds wall time. All three new boundary cases passed again. The prior mobile colour-toolbar case passed; the original 14-block case failed its last bold-shortcut assertion after successfully inserting the native block types. That case had passed in the first candidate run. These two runs do **not** establish a clean seven-case native gate. No product changes or weakened assertions were made to obtain a retry pass. Preserve the inconsistent original UI-test results as an explicit residual verification limitation.

Large private traces remain in the original ignored output directories and are hashed in `retained-private-traces.json`; committed copies retain reports, screenshots and JSON captures. No evidence was deleted. The new boundary assertions and all original native test assertions are unchanged; only JSON serialization/type narrowing in the new test and isolated Vite fixture setup were corrected.

The final shortest frozen-base 14-block-case check also passed 1/1 (19.17 seconds wall time; `browser-baseline-blocks/`). The candidate had one pass and one failure of that same unchanged case, so this is comparison evidence, not proof of a clean candidate gate. Further native UI stability investigation is left to integration; no additional matrix or downloads were started.
