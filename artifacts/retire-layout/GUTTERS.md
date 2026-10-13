# Follow-up: responsive conversation gutters

The conversation message column is an inline-size container. Every message row uses `clamp(1rem, 3cqw, 2.5rem)` horizontal padding: at least 16 px, proportional to the conversation panel rather than the browser, and at most 40 px. Rows remain full-width and readable bodies remain capped at 800 px; compact bubbles still fit their content.

`gutters/report.json` passed 10/10 using the official `tester-army/e2e` + `@e2e-dev/web` engine. `gutters/geometry/*.json` records measured bounds and padding for all five fixed viewports. Padding measured 40 px at 1920, 31.65 px at 1440 and 16 px at 390. There is no page horizontal overflow, including code/image/tool fixtures and open detail drawers.

`screenshots/gutters` contains short aliases of the original screenshots. Compare them with `screenshots/after` for the preceding edge-spread layout. Reproduce:

```powershell
$env:E2E_TELEMETRY_DISABLED='1'
$env:E2E_LAYOUT_PHASE='gutters'
node node_modules/e2e/dist/cli/bin.js run --config e2e.retire-layout.config.ts
```
