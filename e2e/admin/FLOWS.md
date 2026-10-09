# Admin and control-plane flow coverage

Run these cases against the isolated Worker, API and browser environment described in [the E2E README](../README.md). The official e2e Web engine drives the browser; API calls in the public security cases reach the real Worker. Missing credentials and disabled `E2E_MUTATIONS=1` produce explicit skips.

| Flow | Cases |
| --- | --- |
| Login, recovery navigation, reset form, forbidden return; all signed-out management routes | `public.e2e.ts` |
| Anonymous control access and direct internal-route denial; configured local versus untrusted browser origins | `public.e2e.ts` |
| Authenticated student denied management access | `access.e2e.ts` |
| Real platform/company administrator login and saved-session restoration | `management.e2e.ts` setup |
| Every current platform resource list, record count and refresh (37 resources) | `management.e2e.ts`, enumerating `ADMIN_RESOURCES` |
| Dashboard links, user search/status/sort/detail/back/clear, global search, legacy links | `management.e2e.ts` |
| Identity settings save with a Chinese audit reason and reload | `management.e2e.ts` |
| Education organization creation, first administrator invitation, activation and contract view | `management.e2e.ts` |
| Company overview, members, usage, profile save/reload/restore, teacher invitation without email | `management.e2e.ts` |
| Company administrator denied platform-only routes; theme persistence and logout | `management.e2e.ts` |
| Sacrificial account suspension/restoration; company read-only/archive; project activation/end/read-only/archive | `operations.e2e.ts` |
| Populated project/course/document relations; pagination; phone drawer keyboard access/focus/width | `operations.e2e.ts` |
| Final-admin revoke/removal guards; teacher admin grant/revoke/removal; cross-company detail denial | `operations.e2e.ts` |
| Pausing a future-scheduled routine through the platform control plane | `routine.e2e.ts` |
| Replacement administrator invitation and persisted invitation record; deferred text/structured fields; monitoring error/retry | `details.e2e.ts` |
| Company/project lifecycle transitions, invalid transitions, signed-admin authority, bounded reasons, audit and learning projections | `server/src/__integration__/platform-lifecycle.test.ts` (HTTP/database integration, not browser E2E) |
| User lifecycle signed authority, origin rejection/outage, target-only session revocation, failed restoration and a stalled monitoring provider | `workers/control-plane/src/index.test.ts` (Worker/D1 integration with intercepted external services) |

The browser reports include passed, failed and skipped counts in `.e2e/admin/report.json`, JUnit and Markdown. Failure captures may contain account data; the directory is ignored. The dedicated integration test can be repeated through `npm run test:e2e:server -- --file platform-lifecycle.test.ts`. The destructive operations require `E2E_ADMIN_FIXTURES=1` and the separate manager credentials; `seed.ts` creates their isolated company/users and resets only those fixture records when the local API is reseeded. Shared Web teacher/student accounts are not changed by these cases.

The sanitized validation artifacts in `artifacts/e2e` retain commands, build/runtime details, counts and test identities without browser requests, sessions or invitation tokens. A targeted regression pass supplements the preserved full run; it is not presented as a second full-suite run.

## Remaining browser journeys

Listing a resource verifies its real list endpoint and rendering; it does not verify every record-specific command or every field viewer. The following require further fixtures/services and are not claimed as complete:

| Flow | Missing prerequisite |
| --- | --- |
| Password-reset success, email OTP/resend and invite-bound signup | Disposable email delivery sink and actual verification tokens |
| Every resource-specific field viewer, chunked large content, conversation message inspection | Populated examples beyond the covered project/course/document/company/user/routine fixtures |
| Failed agent delivery retry buttons | Representative failed runtime deliveries with a safe delivery sink |
| Generated document/canvas/presentation inspection | Generated artifacts and provider-backed runtime execution; the local knowledge service alone does not produce these |
| Operational service health and incidents | Isolated uptime service; local endpoints deliberately cannot reach production. The unavailable-service UI is covered |
| External browser/device coverage | Additional browsers; current cases use Chromium at desktop and phone widths |

The control-plane suite completed in Linux with D1 storage isolation enabled (13 passed). Its installed Vitest Worker pool falls back from compatibility date `2026-09-01` to `2025-12-17`; details are in `artifacts/e2e/control-validation.json`. Windows initially hit Miniflare isolated-D1 teardown failures. Browser cases separately use the actual local Wrangler runtime, and runs interrupted by its Windows process failure are retained separately from completed validation.
