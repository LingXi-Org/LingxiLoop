# Issue #346 continuation — 2026-10-24

## Scope and remaining product gap

This continuation starts from `11dd55d0f166e060369de323b7c1333447876f45` on
`fix/346-admin-course-membership-handoff`. PR #349 already implemented explicit
administrator assignment, exact course membership readback, retry/idempotency,
and the API authorization checks described in [README.md](README.md). Those
operations are reused without modification.

Source inspection established a smaller teacher-side gap:

1. `server/src/modules/companies/repository.ts`, `promoteStudentState`, ends the
   previous identity and its course grants before establishing the teacher
   identity. Organization teacher status alone does not enroll that teacher.
2. The empty state in `src/desktop/PersonalDashboard.tsx` previously told every
   user to obtain a course invitation from a teacher.
3. `server/src/modules/companies/admission.ts` assigns `STUDENT` to project
   invitation acceptance and rejects a conflicting active `TEACHER` identity
   with HTTP 409. The empty-state instruction therefore pointed an unassigned
   organization teacher toward an inapplicable enrollment path.

The correction passes the active company's existing `AuthCompany.role` from
`DesktopApp` to `PersonalDashboard`. An organization teacher with no available
workspace is directed to their company administrator for assignment as a teacher
to a selected course, then to refresh. Students retain the existing invitation
instruction. An unavailable organization role gets neutral refresh/contact
guidance. Existing workspace selection, loading, error, and authorized-course
rendering remain intact. The role changes guidance only; it grants no course
capability and triggers no enrollment request.

This is a source-backed product correction, not a reproduction or diagnosis of
the original private account. No real student records, private account identifiers,
or production data were used. No API, authorization policy, migration, dependency,
production deployment, credential, or network security setting was changed.

## Focused local qualification

The implementer added `src/desktop/PersonalDashboard.test.tsx` before changing the
component. Both initial runs used:

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/desktop/PersonalDashboard.test.tsx
```

The original component failed the teacher next-step assertion (1 test failed,
3.371 seconds); the corrected component passed the same focused render regression
(1/1, 3.791 seconds). These preliminary runs used the preinstalled dependencies;
the subsequent build exposed a mismatch with the repository lockfile. The test
logs are retained in the conversation tool outputs only. Its synthetic props
cover teacher/student/unknown identity and retain the
existing selection, loading, error, and course-content branches. This is a local
rendering result, not a fresh-login or browser acceptance claim.

- With root dependencies restored from the exact lockfile, the focused render
  regression passed again (1/1, 4.95 seconds), and Biome passed for all three
  changed source/test files. Installed root dependencies include
  `@lyyzka/lingxios@3.8.12`, `@modelcontextprotocol/ext-apps@2.0.0`, and
  `@blocknote/core@0.56.0`.
- Final `npm run build` passed after restoring both lockfiles, including
  `verify:visualize`, `build:visualize-runtime`, web and Node TypeScript checks,
  and Vite (38.50 seconds). Only existing bundle-size/Rollup annotation
  advisories remained. Log: `/tmp/lingxi-346-web-build-exact-lock.log`.
- `git diff --check`: passed at implementation handoff.
- The earlier #349 synthetic API/browser evidence is retained in this directory;
  it was not rerun or reclassified as current-candidate evidence.
- No independent review or expanded reproduction matrix was started, per the
  user's explicit instruction for this continuation.

Environment recovery: the stale root/server preloads contained LingxiOS 3.5.2
instead of locked 3.8.12, and root also lacked current MCP/BlockNote packages.
Initial builds/typechecks therefore failed. Installation encountered an
unwritable default cache and an unused Electron download refusal; using
`/tmp/lingxi-346-npm-cache` and the repository's existing
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` web-CI setting restored the root lock (1,517
packages, 28 seconds) and server lock (333 packages, 10 seconds). No registry,
token, manifest, lockfile, or security setting was changed; both package manifests
and lockfiles are unchanged in the final diff.

## Current public admin delivery evidence

The following unauthenticated, read-only requests returned HTTP 200 on
2026-10-24. Times are UTC file acquisition completion times; SHA-256 values
identify the retrieved bytes.

| Public URL | Time (UTC) | SHA-256 |
| --- | --- | --- |
| `https://admin.lingxilearn.cn/` | 16:01:53 | `b2915dc40c6fd442ce0f10519dd93ccce3e383c776329636c57077208665ca83` |
| `https://admin.lingxilearn.cn/assets/index-D5QEaGpD.js` | 16:02:40 | `681d463a715ffe8576130b49b66312a71a3ae4c133bbbc155674f945ec19869f` |
| `https://admin.lingxilearn.cn/assets/observability-page-BW5jT66U.js` | 16:03:27 | `7be4292f99ecc8181b25ec2a6b3a3ec9b6a0dc7c4b6cfc6b211c4a06d4a29704` |

The served entry contains the older company-member rendering with teacher/student
identity and administrator toggles, without the source's explicit course-assignment
controls. This establishes a delivery gap for the publicly served admin bundle;
it does not justify rebuilding the already-merged membership implementation.
The current HTTP 200 supersedes the earlier root HTTP 403 observation for this
request only. It does not establish why the earlier request failed or a change
to any WAF rule.

The public observability chunk assigns the effective URL
`https://openlit.lingxilearn.cn` in its compiled URL configuration
(`u=Dr("https://openlit.lingxilearn.cn")`). This resolves the URL used in the
currently served public code. It does **not** establish the original CI variable value,
CI artifact identity, or the provenance of a denied artifact download.

## Standalone admin handoff

The current source admin app was built locally with the explicit public URL:

```sh
VITE_LINGXILIT_URL=https://openlit.lingxilearn.cn npm run admin:build
```

The final command passed with the restored root lockfile, including
`admin:typecheck`; Vite completed in 7.37 seconds with the existing chunk-size
advisory. Output is the ignored local `/workspace/LingxiLoop/dist-admin`
directory, with entry `assets/index-qqv0lMgz.js` and stylesheet
`assets/index-Ba46OJSJ.css`. This replaces the preliminary build obtained before
dependency restoration. The build log is
`/tmp/lingxi-346-admin-build-qualified.log`. The explicit URL is an input chosen from
the current public bundle evidence, not a recovered Actions variable.

The qualified local entry contains the existing organization-teacher/course
assignment wording and `/control/company/courses` route. Local output hashes:

| Local artifact | SHA-256 |
| --- | --- |
| `dist-admin/index.html` | `1cd9af7d3f231a507bd45c8c8bd769ca845386c9419a39c8df12bbb829308f33` |
| `dist-admin/assets/index-qqv0lMgz.js` | `c7dbf234ce76df9f36dba42dc0854e64eae9289c2c7531b0be32b91f43687a63` |
| `dist-admin/assets/index-Ba46OJSJ.css` | `ecdd0c4596c4113858b423174229585d35554bf285a4cbefbfd9328c68c58283` |

No CI artifact download, alternate authorization, deployment, or production write
was attempted. The locally built artifact is not the currently served bundle.
An authorized delivery and its resulting receipt, exact served asset identity,
and administrator/teacher acceptance remain necessary before claiming the
standalone admin path is delivered. Issue #346 remains open.
