# Email/calendar retirement and conversation layout acceptance

Official engine: `tester-army/e2e` 0.17.0 and `@e2e-dev/web` 0.12.0. Synthetic product-component fixtures; no external email or calendar effects.

- `before/report.json`: five matching conversation captures at 1920, 1440, 1024, 767 and 390 × 960. The two retirement-only test bodies do not run in this phase.
- `after/report.json`: 10/10 passed. Same conversation/theme/sidebar state; rows occupy the conversation column and bodies stay at most 800 px. Additional cases cover static email/calendar history, retired inline and fallback approvals, long prose/code, images/tools, and the detail drawer. No page horizontal overflow.
- `retirement/report.json`: 2/2 passed with the complete legacy run identity and fallback approval fixture.
- `screenshots/before` and `screenshots/after`: short aliases of the engine's original PNG files. `manifest.json` records source and screenshot hashes; original engine paths are retained beside the reports.
- `integration-full.log` / `.json`: 36/36 across Agent protocol, Agent lifecycle, invitations, reactions and migration checks. A fresh local database reaches migration 0034; the second migration is a no-op.
- `integration.log` / `.json`: strengthened retirement slice, 4/4. Stored calendar/mail history survives; pending effects and stale grants are inert; transactional invitations retain their sending provider.

Reproduce the final browser fixtures:

```powershell
$env:E2E_TELEMETRY_DISABLED='1'
$env:E2E_LAYOUT_PHASE='after'
node node_modules/e2e/dist/cli/bin.js run --config e2e.retire-layout.config.ts
```

To reproduce the original layout comparison, use the parent commit's `ConversationMessage.tsx` for the `before` phase, then restore the layout commit and run the `after` phase. Viewport, fixture, theme and sidebar state are fixed by the test. The original screenshots are not generated from a CSS override.

For server acceptance, use the existing dedicated local service runner:

```powershell
node e2e/server/run.mjs --file retired-product-tools.test.ts --file agent-protocols.test.ts --file migration.test.ts --file messages-vertical-slice.test.ts --file companies-vertical-slice.test.ts --file agents-vertical-slice.test.ts
```

The recorded run used an independent local `lingxiloop_retirement_20261013_test` database and Redis database 5 because another chat held the default integration database. Migrations use exact Git SQL bytes; no checksum guard was bypassed. Core provider calls are recorded fixtures. Real model refusal and actual SMTP/Resend delivery are not claimed by these artifacts; `e2e/web/retired-capabilities.e2e.ts` contains the live opt-in refusal journey for the integrated release gate.
