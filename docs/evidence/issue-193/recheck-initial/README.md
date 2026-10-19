# Initial full recheck (preserved failures)

Official e2e 0.17.0 / @e2e-dev/web 0.12.0: 13 tests, 7 passed, 6 failed. This run does **not** establish complete acceptance.

Passed: original upstream light/dark complete interactions; original render.py standalone export; product variants/tabs/D3/calendar/mobile; session/theme restoration; explicit acquisition retry; synthetic-action rejection with real-click positive controls.

Failures retained in report.json:

- Stale-page test continued querying an iframe that had correctly been disposed after a 410 response. The follow-up test observes host/error/disposal and durable API effects instead.
- Default browser denied native Clipboard write/read permissions. A separately configured, origin-scoped temporary-browser test is required; no success is mocked.
- Offline test clicked a retry button after the online event had already restored the card. The follow-up tests automatic online recovery.
- Capacity test exceeded 600 seconds while the engine repeatedly observed all retained frames. Five-minute idle expiry occurred before proving the 64-page concurrent limit. The follow-up batches public fixture-button setup, then explicitly asserts 64 live pages before the overflow click.
- Product light and dark interactions timed out during guest clicks. Root cause remained under investigation when this report was archived; fresh-browser reruns must retain these original failures.

Three available screenshot pairs (light card, light controls, dark card) are exactly equal at 1440×960/DPR 1 with no masking or resizing. Missing dialog/dark-controls pairs are not passes. The original raw source/styles and product source/styles remain independent; only outer canvas rendering inputs are shared. The subsequent product-only rerun can compare to these original upstream screenshots when source fixture, browser, fonts, viewport, DPR and theme remain unchanged.
