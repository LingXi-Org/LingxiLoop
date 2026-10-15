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

## Verified on 2026-10-15

| Command | Result |
| --- | --- |
| `npm run lint`, `npm run server:lint` | Passed; existing web warnings only |
| `npm run typecheck`, `npm run server:typecheck`, `npm run test:e2e:typecheck` | Passed |
| `npm test`, `npm run server:test` | 87 and 102 passed |
| `npm run build` | Passed; existing bundle-size warning |
| `node e2e/server/run.mjs --file course-forum.test.ts --file homework.test.ts` | 47 passed |
| `node e2e/server/run.mjs --file migration.test.ts` | 23 passed, including fresh/upgrade/rollback constraints |
| `node e2e/server/forum.mjs --browser-only` | 6 passed in 5 files; run `01a13f18-0011-7648-a3f2-b6d1cb714a00` |

The full browser run covers the existing publishing/editor lifecycle, comments,
drafts, attachments, private versions, resource library, retired routes, plus the
new issue-146 flow. The new flow verifies full-page detail URLs/reload/back,
50 collapsed rows with long answers, name search beyond the first page, clearing
and no results, scroll/focus restoration, mandatory references, private snapshots,
both homework types, keyboard interaction and a 390px dark viewport.

[Browser results](evidence/issue-146/browser-results.json) and
[test summary](evidence/issue-146/browser-summary.md) are committed alongside:

- [Desktop, collapsed search](evidence/issue-146/001-issue146-desktop-collapsed-search.png)
- [Student reference submission](evidence/issue-146/002-issue146-student-evidence-submission.png)
- [Teacher viewing a frozen reference](evidence/issue-146/003-issue146-teacher-reference-expanded.png)
- [Mobile, dark, keyboard expansion](evidence/issue-146/004-issue146-mobile-dark-keyboard.png)
- [Report-based homework, collapsed](evidence/issue-146/005-issue146-homework-light-collapsed.png)

For a focused repeat, use `node e2e/server/forum.mjs --browser-only --issue146`.
Both runners require the repository's local PostgreSQL/Redis fixtures and official
e2e Chromium installation. No direct Playwright runner is used.

## Evaluation and privacy behavior

Legacy forum submissions previously allowed answer-only records without references
or an automatic assessment job. New web and Agent submissions now require genuine
canonical user/assistant evidence and insert a `forum.assess` job in the same
transaction as the immutable answer version. The worker validates quoted student
evidence and uses the existing durable retry queue and lease fencing. Pending,
failed and insufficient states remain explicit. Historical missing references
and missing assessments remain missing; no dialogue is fabricated or backfilled.

Report-based homework continues to require an answer/report pair. Saving an eligible
answer now queues report generation automatically; submission cannot bypass pending,
failed or stale reports. The selected excerpts must include the report's cited
student evidence. Up to 20 excerpts can cover the report's 20 evidence sources,
with bounded message counts, payload size and capture time. Teachers receive only
the submitted snapshots, without permission to read unrelated/later private chats.

Integration tests execute the real application, database, ledger and effect worker
with a scripted provider response: an assistant quote fails honestly, then a valid
student quote succeeds on retry. This proves orchestration and validation, not live
model semantic quality. Live-provider homework acceptance was updated for the new
page/reference flow but was not run as part of this local verification.

The simplified UI retains the pinned Memos detail wrapper, metadata, Markdown and
comment composition. “写评论” opens its editor inline just as upstream does.
Student disclosures reuse the same MemoCard and expand without nested cards.
