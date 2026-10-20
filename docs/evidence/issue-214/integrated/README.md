# Integrated PR220 verification

Final production source: `dc50fbc49d9d76acd063632b914a7c6bcb2d0f04`. This combines the reviewed whole-part tail window, message interruption/reduced-motion lifetime corrections, and original Visualize activity identity. The final test/fixture bytes and evidence are bound by `provenance.json`; native runner metadata predates this evidence commit.

- Official browser combination: **15 passed, 0 failed**, 52.34 seconds. Includes original seven, three cross-inline/block/Visualize tail checks, four lifecycle checks and the new original-part identity check.
- Web tests **65/65**, lint, E2E typecheck and full Vite build including Web/Node typechecks passed. Existing warnings remain in the logs.
- Identity red: the new 979-character part appeared in one frame. Final green records intermediate prefixes through the full 979 characters.
- Final normal completion begins with a proven pending queue (`received=1262`, visible=2). Every subsequent sample has actual message status complete; text advances monotonically to 1262 and the final caret count is zero. Cancel/error settle all received text immediately; settled reduced-motion text never retracts.
- The real Chinese color transition records 45 distinct CSS colors, preserved DOM identity, zero stable-block mutations and one visible caret. Whitespace remains exact and only the last two non-whitespace words remain fresh across blocks and Visualize slices.

The first combined run was **13/15**, retained under `root-combined-green`; its output directory name is not a pass assertion. Trace proves the completion test read before React committed complete. The color test started observing after awaiting the entire appended body, potentially missing the transition. Test-only corrections now observe a committed pending queue and start color sampling at dispatch. Original strict assertions remain, with additional message-status, received-length, monotonicity and complete-body assertions; no production timing or test deadline was increased. The corrected color case passed alone, then all 15 passed together. A rejected `--testNamePattern` CLI attempt executed no tests; the valid official selector was `--grep`.

Reports, JUnit, screenshots, failure traces and raw check logs are retained here. `report.json` files are losslessly gzip-compressed. Synthetic fixture content only; no production data, prompts, credentials or private reasoning.

Reproduce using the locked official runner and existing browser cache:

    source /workspace/.lingxi-production/env.sh
    node node_modules/vite/bin/vite.js --port 5212 --strictPort
    PLAYWRIGHT_BROWSERS_PATH=/workspace/.lingxi-setup/cache/ms-playwright E2E_TELEMETRY_DISABLED=1 E2E_PROJECT=web E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5212 node e2e/web/run.mjs e2e/web/streaming-text.e2e.ts e2e/web/streaming-tail-window.e2e.ts e2e/web/streaming-lifecycle.e2e.ts e2e/web/streaming-visualize-identity.e2e.ts --output artifacts/reproduced-combined

The media fixture proves JavaScript queue lifecycle, not native OS/CSS reduced-motion emulation. Live official-site navigation still fails with `ERR_CERT_AUTHORITY_INVALID`; no TLS or browser-sandbox bypass was used. These renderer results are not real-provider latency claims. Exact final PR/main CI and serialized production verification remain separate release gates.
