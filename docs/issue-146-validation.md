# Issue 146: source-based forum detail and submission evidence

Implementation source: usememos/memos `8120a6cee03003ee7968b49b2109f816fa4d96a4`,
`web/src/pages/MemoDetail.tsx`, `components/MemoView/navigation.ts`, and
`components/MemoCommentSection`. Keep its page/content/comment stack and existing
ported Memo components. Course submissions extend that stack; no replacement visual design.

Failure cases identified before implementation:

- Detail opens as a modal; direct URLs/reload/back lose the item type, feed filters,
  scroll or keyboard focus. Nested links accidentally open a post or student row.
- Long answers/report text expand every student row; name search misses students
  past page 1; duplicate names/attempts become indistinguishable.
- Empty, student-only, invented, other-student, other-course or other-tenant
  conversations pass submission validation; Agent tools bypass browser validation.
- Teacher reads unrelated/later chat, another student's submission, or revoked
  course data. A resubmission mutates old evidence or pairs an old answer with a new report.
- Accepted answer has no durable assessment job; restart/lease loss drops a job;
  duplicate submission creates duplicate jobs; failed generation looks like mastery.
- Generated answers or unsupported materials count as independent mastery;
  model quotes invent student evidence; stale workers overwrite a newer result.
- New homework saves require a manual report click; pending/failed reports allow
  answer-only submission; historical records acquire invented conversations.

Verification uses real PostgreSQL/API integration plus tester-army/e2e with the
official `@e2e-dev/web` engine. Synthetic identities and recorded IM transport are
test fixtures; provider-backed evaluation is reported separately from fixtures.
Commands, results and screenshots are recorded below after execution.
