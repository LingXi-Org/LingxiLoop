# Direct teacher homework authoring (#381)

The header formerly only selected a teacher conversation. The new form creates
an ordinary `homeworks` draft through the same application, material ownership,
validation and explicit human publication gates. It does not create a forum-post
assignment or change student learning/evidence/review rules. The existing
assistant path is still available as “教师助手”.

Creation uses a stable client UUID with a transaction-scoped lock and exact
scope/author/content matching. Retry after a committed response loss returns the
same draft. Modified retries conflict and the form offers explicit recovery of
the saved draft. Local inputs and the receipt are scoped by company/account/course.

## Synthetic verification

- Main migration 54 installed in the newly created, dedicated
  `case_assignment_381_20261024_test` database on loopback PostgreSQL.
- `homework.test.ts`: 42/42 passed, including two new HTTP tests. The new endpoint
  tests failed 2/2 with 404 before implementation.
- Browser baseline: the header regression failed and captured the URL changing
  to `view=conversations` (official `@e2e-dev/web`, shared Chromium CDP).
- Official browser against the compiled real application: 4/4 passed in 35.93s
  at implementation head `8b04f197bf61baba922343c091d39eb1b020e99c`. Cases cover
  the direct entry, lost-response retry and student visibility, cancelled late
  assistant navigation/course isolation, and a late creation receipt after
  returning to edit the same course. React duplicate-key warnings were absent.
- Earlier browser failures remain in the handoff evidence. A duplicate sibling
  key caused stale/duplicated editor DOM and was fixed with a homework-specific
  key. The independent review's late-write race was fixed with mounted guards.
- Current-head CI and independent review are tracked in draft PR #388; these
  synthetic results do not establish a deployed release or model judgment quality.

The fixture is `e2e/forum/api.ts` with `FORUM_ISSUE381=1`; it accepts only the
specified dedicated test database in that mode. Run migrations explicitly first,
then the fixture with synthetic environment and a fake model endpoint. It resets
that fixture database. Run Vite against `http://127.0.0.1:53097` on port 53098,
then `e2e run --config e2e.assignment-publication.config.ts` using an existing
browser slot. For the compiled path used in acceptance, build and preview with
`--config e2e/assignment-publication/vite.config.ts` instead of starting dev Vite. The browser suite uses an explicitly synthetic READY receipt to
exercise the real human publication transaction; it makes no model-quality claim.

Focused browser typecheck: `tsc -p e2e/assignment-publication/tsconfig.json`.
Existing #325 and live-homework browser fixtures now select “教师助手” for the
retained assistant workflow. No production accounts, courses or permissions are
read or changed by this suite.
