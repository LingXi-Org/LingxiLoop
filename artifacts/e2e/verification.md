# LingxiLoop E2E verification

Release verification on 2026-10-09: Web 56 passed / 1 explicitly skipped; Admin 82 passed; server integration 197 passed / 2 explicitly skipped; local migration/native-message/object-storage integration 28 passed; control plane 13 passed. Browser totals include required session setup cases and combine the full run with targeted reruns. Each machine-readable report identifies its original runs; this is not a claim of a single all-green full-suite run.

## Implementation and reproduction

- Browser journeys use `tester-army/e2e` **0.17.0** and its official `@e2e-dev/web` **0.12.0** engine. No direct Playwright runner or imports were added.
- [Setup and commands](../../e2e/README.md) create disposable loopback PostgreSQL, Redis, WuKongIM, MinIO and control-plane D1 services. The application API and background workers run separately.
- Browser tests build the actual Web/Admin application. The release runs used managed Chromium, with the initial Web run using an isolated installed Chrome through the official engine’s CDP option.
- [Web flow map](../../e2e/web/FLOWS.md) and [Admin flow map](../../e2e/admin/FLOWS.md) identify individual journeys, prerequisites and unsupported surfaces.
- Native browser reports, screenshots, JUnit and failure traces remain under ignored `.e2e/`; sanitized summaries below are safe to retain with the repository.

## Evidence

| Project | Evidence |
| --- | --- |
| Web | [web-validation.json](web-validation.json) |
| Admin | [admin-validation.json](admin-validation.json) |
| Server/API/workers | [server-validation.json](server-validation.json), [full integration log](server-integration.log) |
| Migration/native messages/object storage | [release-targeted-validation.json](release-targeted-validation.json), [targeted integration log](release-targeted-integration.log) |
| Control plane | [control-validation.json](control-validation.json), [contract log](control-validation.log) |
| Knowledge service | [knowledge-validation.json](knowledge-validation.json) |
| Memory authorization regression | [memory-validation.json](memory-validation.json) |
| Durable ACK/retry regression | [native-admission-validation.json](native-admission-validation.json) |
| Eval | [eval-validation.json](eval-validation.json) |
| Public object gateway | [r2-gate-validation.json](r2-gate-validation.json) |
| Supporting checks and fixture safety | [supplemental-validation.json](supplemental-validation.json), [fixture-safety.log](fixture-safety.log) |

## Fixes exercised by regression journeys

- Invitation handling no longer double-decodes already decoded query values or crashes on malformed percent escapes.
- Course profile fields refresh from saved server values when the panel is reopened.
- The command dialog supplies cmdk context; conversation search commands use the current UI command dispatch path.
- Mobile management drawers restore keyboard focus to their opener.
- Chinese audit reasons are sent in JSON instead of invalid non-ASCII HTTP header values.
- Administrative company/project lifecycle actions and routine pausing use signed platform routes and retain authorization, transition and audit checks.
- Account suspension/restoration forwards signed administrator/session metadata and applies product authorization before changing D1 login state; rejected product operations leave D1 unchanged.
- The retired subscriptions resource no longer calls a nonexistent product table.
- Knowledge retrieval applies the company boundary as well as notebook/source filters; ingestion job arguments no longer duplicate source text into worker logs.
- Revoked memory access maps the published runtime's forbidden result to HTTP 403.
- Integration database safety checks validate the effective database target without logging credentials. Browser fixture seeding rejects connection-string overrides before connecting.

Test-harness corrections are tracked separately from product bugs: complete control-plane response bodies before D1 teardown, accept both valid concurrent-bootstrap schedules, distinguish transport retries before acknowledgement from resends after a persisted acknowledgement, and read download artifacts relative to their test attempt.

## Explicit verification limits

The user confirmed there is no dedicated nonproduction model or email configuration. Live agent completions, interactive tool approval/elicitation through a real model, generated presentations, email/OTP delivery and real inbound email remain unverified. These are not reported as passing.

Knowledge tests use the actual ingestion service and worker, real extraction/object storage and constant-vector local embeddings. They verify protocol, lifecycle and authorization; semantic relevance and paid-provider behavior remain unverified. Eval checks validate local candidate/judge contracts, not a model-quality baseline.

The current browser evidence covers Chromium at desktop and phone widths. Additional engines/devices remain unverified. Composer image upload is explicitly skipped: official Web 0.12 cannot select the detached native file picker in either managed Chromium or CDP mode. Other upload coverage does not substitute for this journey.

Production release `78082e1d` completed successfully through [CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/37882232147) and Komodo update `6ac86a9ed8838102d0f8a053` (`Complete`, `success: true`). Both application nodes, their background workers, gateway, WuKongIM and Notebook run the expected immutable images and are healthy. Both migration containers exited with code 0. The control-plane Worker serves 100% of traffic on its new version; Web, health and Admin HTTPS routes return 200. Full evidence is in [release-validation.json](release-validation.json). The browser tests use disposable local accounts and data.

The release includes the merged navigation, business-layout and agent-actions cases. Fixture corrections explicitly select the intended workspace, distinguish teacher-private rooms from student Study Rooms, and preserve test Notebook IDs across restarts. The final company-administration rerun resolves a transient Cloudflare CAPTCHA verification timeout without bypassing authentication.

Supporting checks on the merged source: Web tests 72 passed, Admin tests 8 passed, E2E/Web/Admin/Server/Control type checks passed, and owning scoped lint checks passed. The control suite passed all 13 checks with the default command in [CI](https://github.com/LingXi-Org/LingxiLoop/actions/runs/37881987813). The deliberately delayed Kuma fixture now has a per-case 30s timeout; production timeout behavior and storage isolation are unchanged. Windows Miniflare teardown remains an environment limitation.
