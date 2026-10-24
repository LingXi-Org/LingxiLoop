# #381 failure model (before implementation)

At 9b2cc3fed2e75b36069b7001c1418084db956201, the forum header only
provisions a teacher room and selects a conversation. No form opens and no
homework is created. Existing #325 tests assert that navigation as success;
they do not establish the requested authoring workflow.

Required regressions:
- Header opens a course-scoped homework form, retains forum URL, creates no room.
- Title, requirements and criteria produce a real DRAFT; explicit confirmation
  remains gated by current validation/revision/hash and publishes one homework.
- Lost creation response/retry cannot duplicate; changing content under the same
  creation identity conflicts. Student, other-course and revoked teacher denied.
- Failed save preserves text/files. Course/account change cannot display a stale
  result; drafts resume in their original scope. Published homework visible to
  student and retained after reload. Existing PASSED/RETURNED lifecycle unchanged.
- Optional teacher-assistant entry retains its explicit room behavior; it is not
  labelled as publication. Existing #325 coverage follows that explicit action.

Only isolated synthetic PostgreSQL, recording WuKong and loopback fake providers;
no real courses, permission changes, provider or production calls.
