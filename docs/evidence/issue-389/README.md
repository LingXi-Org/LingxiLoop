# Case draft visibility investigation (#389 / LL-160)

Baseline: `6a10d3216f10a9c9f8ad4de5db636e66f35f56c0`.
**No draft-content authorization bypass reproduced.** This is a regression and
evidence delivery, not a claim that the original production report was fixed or
false. No original private draft, user account or production service was read.

## Observed behavior

The new official-engine browser test creates an article through the UI, fills
title/summary/body/category, and selects **保存草稿**. Real API readback confirms
`status=draft`, `publishedVersion=null` and the saved body. A second organization
teacher can manage it, as intended by the current policy. A `STUDENT` reader:

- receives no draft item or private category in the unfiltered, keyword-filtered
  or category-filtered list;
- receives HTTP 404 from the direct draft endpoint;
- sees no draft heading/body or create control after switching role and loading
  the case library; a direct browser link displays an unavailable response;
- sees the published snapshot after explicit publication, and still sees that
  snapshot when a teacher saves another revision without publishing.

The existing `organization-cases.test.ts` integration suite passes **11/11**.
It also covers reader write denial, same-organization teachers, cross-organization
denial, draft/search/category isolation, image authorization, publication failure,
concurrent saves, unpublish and retrieval version boundaries. External providers
are recorded/in-memory fixtures; there are no live model or production calls.

## Source findings

- `server/src/modules/cases/application.ts`: `save` updates only the draft;
  `payload` denies unpublished detail to readers and selects the published
  snapshot; `list` projects before search/category filtering. Images and retrieval
  have their existing publication checks.
- `server/src/modules/access/policy.ts`: `cases:manage` belongs to organization
  `TEACHER`, including non-admin teachers. A non-admin teacher is therefore not
  a read-only test identity. Ordinary readers here are `STUDENT`.
- Reader metadata is not a frozen published snapshot: `version`, `updatedAt` and
  ordering can change when a teacher saves a draft. These are observable metadata
  changes, not evidence that the new title/body/category was disclosed.
- A manually injected same-user/company role refresh could expose a defensive
  component-state gap in `CasesPage`, which subscribes only to company identity.
  However, the production session callers do not establish that path: `AuthGate`
  probes at mount, and invitation acceptance replaces/unmounts `AuthedApp` before
  updating the session. Different users/companies remount it via `App`'s key.
  No production-reachable role-refresh leak was established, so this PR makes no
  speculative state or permission change.

## Validation and failed setup attempts

- New UI + HTTP/PostgreSQL browser journey: **1/1 pass**, Chromium, 14.58 seconds.
- Existing cases integration suite: **11/11 pass**, approximately 9.58 seconds.
- Focused E2E TypeScript and `git diff --check`: pass. Product build/full web tests
  were not rerun because no product source or dependency changed.
- Initial browser run passed the ordinary-reader test. An exploratory synthetic
  departure/re-admission fixture returned HTTP 500 during setup/cleanup before
  establishing a role-refresh product failure. That experiment and endpoint were
  removed; it is not counted as a reproduced defect.
- Integration setup initially lacked `LINGXILOOP_INVITE_BASE_URL`, then encountered
  an unmigrated second test database. Both failed before behavioral assertions.
  The final run used a migrated dedicated database and passed all eleven tests.

See [checks.json](checks.json) for runner IDs, exact source hashes and limits.
The new test is selected by the existing `e2e/cases/*.e2e.ts` glob. Use
[the existing fixture guide](../../../e2e/cases/README.md); with its services active:

```sh
e2e run --config e2e.cases.config.ts e2e/cases/draft-visibility.e2e.ts
node server/run-integration-tests.mjs --file organization-cases.test.ts
```

This environment used task-owned PostgreSQL/Redis ports 55436/56383, separate
`lingxiloop_cases_browser_test` and `lingxiloop_cases_auth_test` databases, and the
official engine's public CDP connection to installed Chromium. No direct
Playwright import, persistent permission change or shared production credential
was used. Role switching uses synthetic authentication and fresh page loads;
real gateway sign-in/out, other browsers and the original production incident
remain unverified.

## Minimum evidence needed to resolve the original report

The designated publisher/reporter can supply these sanitized fields for the two
reported accounts and one affected case, without draft text or raw logs:

1. Product commit/version and capture time; whether the reader performed a full reload.
2. Actual organization membership role (`TEACHER`/`STUDENT`), admin flag and active
   status. Account names/emails are unnecessary; use distinct opaque labels.
3. Whether the observation was an entry, status/date/order, summary, or full body;
   list versus direct-detail route. A case ID is only needed privately for a
   specifically authorized follow-up, not in this public issue.
4. Case `status`, `version`, `publishedVersion`, and whether an earlier version
   had been published; reader request HTTP status and `canManage` value.
5. A yes/no comparison of returned title/summary/body with draft versus published
   fields, or separately supplied digests. No content or response dump is needed.

No production write or migration is required for that diagnostic. Keep #389 open
pending that distinction; passing synthetic tests cannot close an unlocated report.
No cases contracts/API/application, cover implementation, permissions or schema
changed, so this work does not overlap #376's product changes.

## Synthetic screenshots

- [Reader direct-draft access denied](reader-draft-denied.png)
- [Reader retains the published snapshot](reader-published-snapshot.png): the author
  explicitly published this initial text; the later unissued revision is absent.
