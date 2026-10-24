# #382: course settings context and capability follow-up

This follow-up fixes reproducible client-side gaps. It does **not** establish
why LL-088 reportedly persisted a student edit in production, and must not
automatically close #382. PR #384 remains the earlier server authorization
baseline; its evidence is retained in [README.md](README.md).

## Confirmed gaps and changes

- Switching from course A to B retained A's loaded form while applying B's
  capability flags. A failed B request left that old form available. Settings
  state now belongs to one company/project/course key, and fetched details must
  match that scope before rendering.
- A learning-space snapshot could still advertise teacher write access when
  current course details reported `canManage: false` or a different status.
  Editing and lifecycle actions now require agreement with the fetched details.
  Organization administrators remain supported; there is no extra requirement
  for a direct teacher grant or a specific `courseRole`.
- Metadata/lifecycle confirmations and an avatar upload could retain callbacks
  after leaving a course or losing edit capability. The callbacks now recheck
  their mounted scope and latest capabilities before writing; profile responses
  from an obsolete scope cannot update the new form.

Production changes are confined to `CourseSettingsSection.tsx` and
`CourseProfileSettings.tsx`. Server authorization, schema, dependencies and the
#346 teacher-management flow are unchanged. Eight read-only assertions extend
the existing two LL-088 integration cases to prove that course detail projects
student `courseRole: learner` / `canManage: false` and administrator
`canManage: true`; no role matrix was added.

## Verification

The implementation regressions were written first. The original settings state
and lifecycle tests failed before the fixes; profile callback regressions failed
for permission loss, unmount and retained avatar callbacks. Adding current-course
capability/status assertions also failed before their minimal implementation.
The final two focused unit files pass **10 leaf cases** (12 Node-reported tests
including two parents). [Compact results and source hashes](settings-context-checks.json)
record the commands, counts and environment recovery attempts.

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/learning/dashboard/CourseProfileSettings.test.tsx
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/learning/dashboard/CourseSettingsSection.test.tsx
E2E_TELEMETRY_DISABLED=1 E2E_CDP_URL=http://127.0.0.1:19382 npx e2e run --config e2e.course-settings.config.ts
node e2e/server/run.mjs --file courses.test.ts
npm run build
npm run server:typecheck
npx tsc -p e2e/course-settings/tsconfig.json --noEmit
```

The new official `@e2e-dev/web` browser fixture uses real settings components and
HTTP transport with synthetic local responses. **5/5 passed on its first run**:
student entry denial; fresh student course details overriding stale teacher
capabilities; switching/loading/failure/retry and saving only B; permission loss
during confirmation; and unmount on switching to learner during confirmation.
See the [browser report](settings-context-browser.md).

Real HTTP/PostgreSQL integration passed **8/8**, including both course types and
both existing metadata writers, unchanged student-denial state/audit/effects,
and legitimate teacher/administrator saves. This run used fresh task-owned
PostgreSQL/Redis containers on loopback ports 55433/56380 with database
`lingxiloop_issue382_test`, the official runner's sanitized environment, explicit
migration entrypoint and selected `courses.test.ts` command. Existing stopped
containers and environment files were not used. Database initialization initially
refused the cloud image's stale 3.5.2 runtime; restoring the locked formal 3.8.12
package resolved it before the sole integration test run.

The package install first encountered an unwritable default cache, then one
GitHub Packages 401. One retry with the same existing identity succeeded. No
credential replacement, network/security configuration change, or version check
bypass was used. Root and server locks were unchanged. A redundant nested
`server/node_modules` caused local type-resolution errors; it was moved out of
the checkout to restore the root-only dependency layout used by CI.

The production web build (including web typecheck), server typecheck in the CI
dependency layout, fixture typecheck, focused lint and whitespace checks passed.
No independent review or expanded test matrix
was started, as requested. No production data or production writes were used.

## Evidence boundary

Browser responses are synthetic, and HTTP integration injects authenticated
identities. These tests prove the concrete client gaps and preserve the existing
server boundary; they do not verify the original production account/session,
deployment version or reported durable student write. Keep #382 open for the
minimal redacted evidence already requested in the original issue. This work is
handed off as a draft PR; only the designated integrator may merge and deploy.
