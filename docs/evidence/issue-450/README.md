# #450 — Studio Admin course materials

Base: `9e3bfd892fa53f22dddbc00e98f466c21ce01b7d` (latest main when started,
2026-10-25). Draft PR: https://github.com/LingXi-Org/LingxiLoop/pull/455.
This task implements only #450. Release integration, production rollout and
production teacher/two-student acceptance belong to the designated release coordinator.

## Source reuse and product behavior

- [Source mapping, fixed upstream commit and modification notes](../../../third_party/studio-admin/README.md).
- [Original-to-local component diff](../../../third_party/studio-admin/adaptations.diff),
  [original SHA256 manifest](../../../third_party/studio-admin/upstream-sha256.txt),
  [full MIT license](../../../third_party/studio-admin/upstream/LICENSE).
- `course-materials` is the single route and dashboard implementation.
  The existing narrow rail consumes the existing dashboard menu registry;
  `?view=library` canonicalizes to the new route. The forum remains separate.
- Public/private tabs, search, format filter, byte/date/name sorting, selection,
  upload progress/retry, original download, rename and confirmed deletion use
  real sources and server capabilities. There are no template actions or demo rows.
- The old `ProjectSourceLibrary`, `SourceLibraryBrowser`,
  `KnowledgeSourceUploadDialog` and old-only `SourceSkeletons` are deleted.
  Shared knowledge API, conversation selection, indexing and detail components remain.
- Query keys include organization, user, course and space. Component identity
  resets preview/selection/dialog state on scope changes; auth teardown clears
  caches and uploads. Upload presign/completion retain original organization/course
  headers and user identity, including retries after the object PUT succeeds.
- The server chooses visibility from actual course membership. Public changes
  require a course teacher, including legacy student-created public records;
  private access remains owner-only for ordinary teachers and other students.
  Existing platform administration policy remains unchanged.
- Original-file operations do not require Notebook availability. Unsupported
  parsing and uploads while indexing is disabled finish as `stored` /
  `stored_only`, with authenticated download. Supported indexing formats still
  queue when indexing is enabled. No database migration or object-store replacement.

## Focused verification

Commands use the exact root lockfile installation, matching CI. The environment's
older nested server dependencies were replaced, then moved aside so checks use
the same root-only module resolution as CI. See [browser setup](browser-setup.md)
for the isolated environment and retained failed setup attempts.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed; existing warnings only |
| `npm run build` (includes web and Node typechecks) | Passed |
| `npm test` with changed materials/navigation/sensitive-action tests in `CI_TEST_FILES` | 142 passed, zero failed/skipped |
| `npm run server:lint` | Passed, 731 files |
| `npm run server:typecheck` | Passed |
| Format, permission-policy and knowledge-retrieval unit tests | 16 passed |
| Selected `knowledge-vertical-slice.test.ts` integration | 12 passed, zero failed/skipped |
| `git diff --check` and regenerated upstream provenance | Passed |

The knowledge integration exercises PDF, DOCX, PPTX, XLSX, Markdown, TXT, CSV,
JSON, JPG, PNG and ZIP. It verifies byte-for-byte original downloads through the
authenticated file router, refresh/persistence, owner-only private access,
public reads by two students, course membership requirements, legacy public
student management denial, strict scope/owner input, cross-course/organization
boundaries, HEAD size/type and signature checks, completion/replay behavior,
stored-only handling, existing lease and conversation-source selection behavior.
Its injected object-store adapter is distinct from the browser test's real
MinIO presigned PUT/download lifecycle; neither establishes production acceptance.

## Browser evidence

The official `e2e` / `@e2e-dev/web` engine exercises the real local control-plane
login, product API and MinIO service. The file lifecycle uploads PDF, DOCX, PPTX,
XLSX, Markdown, PNG and ZIP, reloads the list, downloads through the UI and checks
all seven originals byte-for-byte against fixture files and native artifact SHA256.
Search, format filtering, rename/delete, public/private switching, real teacher
and second-student denial, sidebar, command palette, history, refresh and course
switching are covered by selected browser scenarios.

- [Teacher public space](screenshots/course-materials-teacher-public.png)
- [Student public space](screenshots/course-materials-student-public.png)
- [Student private space](screenshots/course-materials-student-private.png)
- [Actual build/source/screenshot hashes](browser-build.json)
- [Per-run browser outcomes](browser-results.json) and [seven original-file checksums](course-materials-downloads.json)
- [Earlier attempts and their distinct failures](browser-prior-attempts.json)

The screenshots use the documented genuine-cookie authentication setup: a real
Turnstile token and ordinary sign-in endpoint return the browser's session.
Original secret-filled sessions remain protected. No screenshot protection,
authentication, rate limiter or browser sandbox was disabled. Evidence excludes
cookie values and raw authentication traces. The final build is identified by
file hashes because it was built before the final evidence commit was created.

The final broad run passed 13 checks; two authentication-readiness cases hit the
unchanged 60-requests/60-second limit. After natural expiry, both affected cases
and their login setup passed in a focused follow-up (3 passed, zero failed).
Thus 15 unique checks have passing evidence across two runs, rather than one
15/15 run. Optional live Notebook/worker ingestion was not run because those
services were not started. The global E2E typecheck had existing unrelated
errors; the five affected browser files passed their focused TypeScript check.

The initial CI run on `4aa74048` exposed two test failures: a now-retired review
component referenced by the touched sensitive-action regression, and a fixture
attempting a forbidden company identity mutation. The dead assertions were
removed without changing live flows, and the membership test now uses a real
teacher without course authorization. The corresponding tests passed locally.

## Release boundary and rollback

Do not close #450 from this draft PR. The designated coordinator must integrate
the final candidate, verify successful CI for the release commit, deploy through
the established process, and record teacher plus two-student production smoke
results and deployed version. Roll back code/deployment versions if necessary;
keep existing source IDs, ownership and stored objects. No historical cases
were regenerated and no production data was written by this task.
