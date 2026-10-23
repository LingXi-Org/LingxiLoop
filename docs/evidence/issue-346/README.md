# Explicit course teacher assignment (#346)

## Behavior and boundary

Organization teacher identity and course membership are separate. Converting a student into a teacher intentionally ends the old student identity period and withdraws its old course grants. The missing product path was explicit enrollment of that company teacher in one selected course.

Company administrators can now select an existing company teacher from course members, or select an eligible course from company management. The company member page shows exact course assignments separately from organization identity and administrator rights. Success requires membership readback; errors retain the selection and idempotency key. A late response from course A cannot overwrite course B or close its new dialog.

The company management GET/PUT endpoints require active company administration, resolve the company from that identity, check the selected course ACL, and reuse the existing transactional teacher membership command. Ordinary teachers cannot enumerate the company directory. Student-to-teacher conversion, identity-period privacy, course-specific publishing, and all existing authorization rules stay authoritative. There is no migration or automatic enrollment into other courses.

## Local qualification

All accounts and course data are synthetic. The API cases use real local PostgreSQL and product routers with injected synthetic authentication; the browser cases use real product components with local synthetic fetch responses. No provider calls or production operations were made. The original account/course was not inspected or reproduced because no stable identifiers were supplied.

- API red baseline: 5/5 failed before the new management routes existed (HTTP 404).
- New API cases: 5/5 passed, including a subsequent 5/5 run with explicit DRAFT-course assignment returning 201. A teacher without course membership is denied; explicit enrollment makes actual forum-assignment publishing return 201; a fresh HTTP context sees the durable grant; another course remains denied. Promotion requires a new teacher period and one explicit course grant. Crafted student roles, suspended targets, other tenants, non-admin actors, and revoked memberships remain rejected.
- Owning API set: **26/26 passed, zero skips**, across `course-teacher-assignment`, `courses`, `company-admin`, and `companies-vertical-slice`. This proves fresh-request authorization, not original-account login/token rotation. An existing asynchronous command-audit teardown warning appeared after pool shutdown without a test failure.
- Official browser: **10 scenarios observed passing** across the final full run (9/10) and an unchanged targeted rerun (1/1). The initial full-run failure showed a blank first page after the Vite cache was relocated to recover local disk space; no product or assertion changes preceded the passing rerun. Both run results are retained. See [browser-summary.json](browser-summary.json) and the two synthetic screenshots. Includes scope isolation, successful readback/reload, directory privacy, retry after list/write/readback failure, and stable idempotency keys. The course-switch regression failed before adding the mounted/scope guards and passed after them.
- Server typecheck and changed-server-file lint passed. Web/admin lint, typechecks and builds passed on the initial candidate; the final two-line DRAFT eligibility adjustment passed browser-fixture TypeScript (including product UI) and focused lint. Exact-head CI must repeat the complete builds. Existing unrelated lint warnings and bundle-size advisories remain.
- DRAFT eligibility was a separate tests-first correction: the initial browser case failed because the assignment button was absent, before a disk-space failure interrupted its READ_ONLY companion. The final DRAFT and READ_ONLY cases passed. The DRAFT/ACTIVE assignment condition is independent of student promotion, which remains ACTIVE-only.

The browser summary records the actual dirty base revision used for qualification; it is not represented as a later committed head. CI and final independent review are attached to the PR's exact head.

## Repeat locally

Use an isolated empty PostgreSQL database with the repository's exact formal dependency and local Redis. Set `DATABASE_URL`, `INTEGRATION_DATABASE_URL`, `REDIS_URL` and the existing synthetic integration environment. Do not point these tests at production or a shared working database. Initialize only that new empty database using `npm run db:migrate`, then:

```sh
node server/run-integration-tests.mjs --file course-teacher-assignment.test.ts --file courses.test.ts --file company-admin.test.ts --file companies-vertical-slice.test.ts
E2E_TELEMETRY_DISABLED=1 npx e2e run --config e2e.course-teacher.config.ts
npx tsc -p e2e/course-teacher/tsconfig.json --noEmit
npm run server:typecheck
npm run lint
npm run admin:lint
npm run build
npm run admin:build
```

The official browser engine requires its standard Chromium installation (`npm run test:e2e:install`). Its localhost fixture does not use production credentials. The API test emits `artifacts/issue-346/api.json`; the browser emits `.e2e/course-teacher/report.json` and screenshots. The committed [API summary](api-summary.json) contains only synthetic assertion results.
