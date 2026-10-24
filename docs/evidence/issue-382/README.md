# #382: course settings authorization verification

Baseline: `9b2cc3fed2e75b36069b7001c1418084db956201`, published LingxiOS 3.8.11.
The external LL-088 report says a student saved course metadata. **That production
behavior has not been reproduced or explained. This change adds coverage; it does
not claim to fix an established authorization vulnerability.**

## Owning boundaries and failure modes

- Course PATCH: `modules/learning/router.ts` requires `course:update`; the
  application checks again inside its transaction with dependency locks.
- Project PUT: `modules/knowledge/router.ts` requires `project:update`; its
  application also checks inside the locked transaction.
- Both policies require project TEACHER. The resolver uses the current active
  company membership and matching project admission period. An organization
  administrator has explicit course management rights without a course grant.
- Migration 0011 rejects STUDENT + administrator and active project/company role
  mismatches. Neither display name nor a caller-supplied role grants access.
- UI navigation requires teacher perspective + canManage; editing additionally
  requires server-projected canUpdateCourse. No product/UI changes were justified.

The missing coverage was the alternative project writer, legitimate non-admin
teacher vs organization administrator, revoked membership, both course kinds,
server-projected capabilities, and durable state after rejection.

## Isolated result

`courses.test.ts`: **8/8 passed**, including two new matrix cases:

| Actor/state | Course PATCH | Project PUT | Persistence assertion |
| --- | --- | --- | --- |
| Enrolled STUDENT, including forged identity/role headers | 403 | 403 | Metadata, course-update audit and sync effect unchanged |
| Unassigned non-admin teacher | 404 | 404 | Unchanged |
| Assigned non-admin teacher | 200 | 200 | Description read directly from PostgreSQL |
| Organization administrator without course grant | 200 | 200 | Description read directly from PostgreSQL |
| Forged company scope | 404 | 404 | Unchanged |
| Revoked teacher membership | 403 | 403 | Unchanged |
| Administrator on read-only course | 403 | 403 | Unchanged |

The matrix runs for TEACHING and INSTITUTIONAL_COURSE. Student identity is checked
in PostgreSQL and learning-spaces returns learner / canManage=false /
canUpdateCourse=false. Existing invitation and course-isolation cases remain.

Reproduce with a fresh disposable local test service:
`node e2e/server/run.mjs --file courses.test.ts`.
Here an existing stopped test service had stale runtime installation metadata;
migration refused it before tests. We stopped the services we had started and
used separate task-owned empty PostgreSQL/Redis containers on 55433/56380 with
the existing runner's sanitized environment and the same migration/selected-test
commands. No production environment was loaded. The first matrix run expected
404 for revoked membership; the existing contract maps it to 403. That test
expectation was corrected; neither attempt accepted a revoked write.

[Compact measurements and source hash](checks.json) retain every attempt.
Server typecheck, focused lint and diff checks passed. Independent baseline review
found no confirmed bypass and passed 12 permission-policy tests.

## Remaining evidence needed

Only the authorized main integrator should correlate the reported occurrence:
time with timezone, deployed application commit, HTTP method/route template/status,
server-returned organization role/isAdmin, whether reload retained the change,
and whether an audit event identifies an authorized or unauthorized actor.
Private identifiers stay in the authorized channel. No cookies, tokens, passwords,
course content, or broad private-history search are required. Do not test writes
on actual student records.

The fixture injects the authenticated actor while exercising real HTTP routing,
authorization, transactions and PostgreSQL. Production identity mapping, browser
login/session switching and the original report remain unverified. This PR must
not auto-close #382 as a confirmed production fix.
