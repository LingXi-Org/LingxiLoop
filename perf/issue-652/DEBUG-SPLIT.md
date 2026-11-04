# Optional Slides file debugger

Base: `bb1186f4` (only open PR at start was the superseded #657 build check).
The browser previously loaded the complete file-debug panel even when its
`appifact-files-debug` setting was disabled. Browser core now keeps the native
file input decoder, publishing wrapper and noop debugger. Enabling the existing
setting loads the original full module before runtime initialization. A failed
optional import logs a generic warning and boots with the noop debugger.
The Node compiler still installs the original full module synchronously.

Paired static builds from the same local dependencies:

| First-view JS | Base | Candidate |
| --- | ---: | ---: |
| Raw bytes | 3,557,140 | 3,526,416 |
| gzip (manifest initial graph) | 1,154,510 | 1,143,271 |
| Brotli (entry plus modulepreloads) | 925,536 | 916,407 |

The 9,129-byte Brotli saving is about 1%. This is resource-graph evidence, not
a new click-to-edit p75 measurement. #652 cold/retained budgets and #660 drag
acceptance remain open; no sidebar geometry, default, folding or reset is changed.
Design's core is unchanged.

Validation: `node --test scripts/slides-editor.test.mjs` passes 26 tests,
including core/noop/file publishing contracts and graph exclusion. Chromium
154.0.8037.57, Linux, 1440x1000 viewport and loopback, no throttling:
the actual built editor reaches `slides:runtime-ready` with zero page errors
when debug is off (zero panel requests), on (one hashed panel request), or its
optional panel request returns 503 (warning plus successful core boot). These
three boot checks do not qualify editing, real production ACLs, or latency tails.

Cross-release resource retention: `node --test deploy/retain-editor-assets.test.mjs`
passes 8 tests, including container stdin and observed-image handling. Recovery:
`node --import tsx --experimental-test-module-mocks --test shared/artifact-recovery.test.ts src/features/artifacts/components/artifact-recovery-handoff.test.ts`
passes 28 tests. They cover snapshot mutation, handoff sealing/cancellation and
parent-origin protocol behavior. Existing browser expiry/downgrade recovery
records remain historical; no new real authorization or two-host rollout is
claimed here. Worker routes/CSP/retired Visualize 410 and recovery code are untouched.

Local dependencies reuse the prior checkout, with KaTeX copied locally so esbuild
input paths match the contract. Exact formal dependency validation belongs to CI.
