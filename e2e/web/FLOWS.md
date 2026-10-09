# Web flow coverage

The supported product is the browser SPA. These cases drive the actual app with `@e2e-dev/web`; they do not replace API responses or application stores. A collected or skipped test is not verified coverage. The sanitized `artifacts/e2e/web-validation.json` combines the latest executed result for each owned case and links its original report. Concurrently authored `navigation.e2e.ts`, `business-layout.e2e.ts`, and `agent-actions.e2e.ts` belong to separate work and are not claimed by this flow inventory.

| Flow | Browser coverage | Required services/data |
| --- | --- | --- |
| Signed-out entry, labelled fields, closed registration, recovery navigation, phone layout | `auth.e2e.ts` | Vite; `/api/session` for a real signed-out response |
| Invalid password-reset token | `auth.e2e.ts` | Control plane authentication |
| Company/project invitation errors; malformed percent-encoded hash | `auth.e2e.ts` | Web/API invitation preview; network errors are shown rather than blanking the app |
| Teacher/student login and session restoration | `session.setup.e2e.ts`, `workspace.e2e.ts` | Control plane + PostgreSQL membership; Turnstile test keys; `E2E_USER_MEMBER_*`, `E2E_USER_STUDENT_*`; `E2E_WORKSPACE_NAME` defaults to the seeded `E2E Classroom` |
| Logout and server session revocation | `workspace.e2e.ts` | Same; a fresh login avoids invalidating other saved test sessions |
| Workspace selection; command palette navigation/search focus/composer focus/message find; navigation to agents, mail, overview, resources, calendar, chat | `workspace.e2e.ts` | Web/API project and learning spaces |
| Teacher/student navigation boundaries | `workspace.e2e.ts` | Student membership |
| Course create, profile edit/persistence, objective create/publish, activity create/publish, invitation create/revoke, course end | `course.e2e.ts` | Teacher membership, real WuKongIM course room, `E2E_MUTATIONS=1` |
| Teacher publishes activity; student submits evidence; student history persists; teacher opens original evidence | `learning.e2e.ts` | Seeded triangle objective, teacher/student accounts, real learning APIs; no fabricated evaluation |
| Email-bound course invitation acceptance, fixed identity, member removal, project visibility and search isolation | `membership.e2e.ts` | Existing teacher/student accounts and a disposable UI-created course; execution status is in the report |
| Calendar modes, date navigation, cancelled edit | `workspace.e2e.ts` | Calendar API |
| Calendar validation, personal event create/update/reload/delete | `calendar.e2e.ts` | Calendar API, `E2E_MUTATIONS=1` |
| Conversation empty-selection/search validation | `workspace.e2e.ts` | Participants API |
| Human DM create/send/reload/history search, quoted reply, pin/mute/reload/restore; canvas preview/open/close/focus | `conversations.e2e.ts` | Real WuKongIM and canvas API, `E2E_PEER_NAME`, `E2E_MUTATIONS=1` |
| Durable DM visibility and reload from the recipient account | `recipient.e2e.ts` | Real WuKongIM; fresh member/student logins; execution status is in the report |
| Group create/persistence/leave; phone chat/list navigation | `conversations.e2e.ts` | Two peers named in `E2E_GROUP_PEERS`, separated by `|`; real WuKongIM |
| Canvas text card create/edit/move/reload/download/delete | `canvas.e2e.ts` | Same group fixture, canvas API, actual WebSocket proxy; `run.mjs` checks exact exported bytes against the report's download artifact and emits `export-validation.json` |
| Mail search reset, composer open/close, missing-body and missing-recipient rejection | `workspace.e2e.ts` | Mail read API; no external email is sent |
| Settings sections, theme persistence, notifications form, focus return, phone drawer | `workspace.e2e.ts` | Preferences API |
| Notification schedule/switch persistence; generated and uploaded avatar persistence | `preferences.e2e.ts` | Preferences API and object storage; reuses `public/icon-192.png` as the upload fixture |
| Private text source ingestion/preview/rename/reload/delete | `knowledge.e2e.ts` | Student, actual worker, storage, Open Notebook/SurrealDB, `E2E_KNOWLEDGE=1`, `E2E_MUTATIONS=1` |

## Remaining flow requirements

These flows or backend contracts are **not asserted by the browser cases above**. Existing server integration tests are complementary evidence, not a substitute for missing browser journeys. Components without current UI callers are identified explicitly.

| Flow | Needed to complete browser verification |
| --- | --- |
| Invite-bound signup, OTP verification/resend, password reset success, wrong-email and already-member invitations | Disposable email receiver and actual delivery/verification tokens; expired/revoked/consumed/archived invitation fixtures |
| Multi-company switching | Unsupported by the current single-company authentication contract: `setMe` requires one company and `setActiveCompany` rejects another. Admin/API suites separately exercise cross-company authorization. |
| Agent conversation, concurrent replies, cancellation, tool approval/rejection/elicitation, citations, retries/reconnect | Working published LingxiOS provider and worker; deterministic test tasks without production secrets |
| Live concurrent DM delivery/read receipts and adding group members | Second concurrent authenticated browser and another human; persisted recipient text-message access is covered separately above |
| Composer native image upload and recipient attachment retrieval | Explicitly skipped after the Chrome/CDP run could not retain a selectable native picker input. Official Web 0.12 exposes `setInputFiles` but no file-chooser API, and this composer has no existing file paste/drop path. No application hooks or network replacements were added. Avatar and knowledge upload coverage does not substitute for this journey. |
| Conversation archive and thread drawer | The current conversation menu has no archive action. `openThreadView` has no UI callers; the unused drawer is not counted as a supported browser journey. |
| Document creation/editing and exported snapshots | Current `documents.create`/`documents.edit` tools intentionally return downloadable Markdown artifacts. Their API/agent integration coverage belongs to the server suite. `DocumentsView` and `DocumentLink` currently have no UI callers; the old editor is not counted as a supported browser journey. |
| Canvas collaboration and timeline artifacts | Second user and an artifact-producing agent task |
| Presentation outline review, generation, slide viewing, export | Working presentation runtime and provider; generated artifact fixture |
| Knowledge file/URL ingestion, retries, private/public visibility and conversation source selection | Storage, Open Notebook, worker, authorized public source; second user for isolation assertions |
| Evaluated evidence, mission progress and evaluation-dependent growth detail | Actual evaluation/model provider; activity submission and original evidence drilldowns are covered above |
| Course role changes | Company identity is immutable through a course; the API rejects changing learner/teacher identity. Membership coverage checks the supported fixed identity and removal behavior. |
| Course read-only/retention/archive transitions | Dedicated lifecycle courses and their owning authorized lifecycle states |
| Agent task scheduling/recurrence/manual run, reminders and notification delivery | Running calendar worker, provider, isolated delivery sink and controllable schedule |
| Sending/replying to email, attachments and inbound thread updates | Explicit test recipient/sink and real email integration. External delivery needs direct authorization. |
| Notification preference isolation and sound effects | Two projects; browser permission/audio checks |

Use the same Chromium implementation at desktop and phone sizes. Responsive tests do not claim iOS/Android native coverage; Electron packaging is outside the supported release surface.

The user confirmed no dedicated model account or email receiver is available for this run. Live model completion/quality and email delivery remain unverified. The local Notebook provider fixture exercises ingestion plumbing, not live model quality.
