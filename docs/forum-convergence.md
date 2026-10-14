# Forum convergence (#129, #131, #132)

## Removal and retention plan (before implementation)

Remove the course-content/management dashboards, objectives/knowledge units,
learning activities, missions, growth tracking, independent learning cases,
their API clients, routes, repositories, Agent tools, scheduled digests and
projections. Remove independent course-resource navigation; attached references
remain accessible from their forum post or assignment.

Keep course IDs, project membership, teacher/student authorization and invitation
admission as the forum's security context. Keep shared knowledge storage and
authenticated uploaded files for assignment references and Agent assistance.
Keep private teacher conversation authorization, general IM, documents, Canvas,
and the shared LLM ledger; these are not parallel learning product models.

Existing forum-visible assignments migrate with their original IDs, author,
publication/creation timestamps and deadlines. Submissions preserve IDs, learner,
monotonic version ordering, answers, links, attachments, source/Agent attribution,
idempotency keys and feedback. Draft/unmapped historical learning data must be
archived explicitly before dropping its tables, never promoted into public posts.
The migration must fail atomically on invalid mappings or counts. Archived data
has no product API and must not become a fallback authorization path.

## Migration and release order

1. Back up PostgreSQL and record a verified restore point. Drain affected Agent
   runs and stop old API/worker writers before applying the next migration.
2. Apply the next-numbered migration in the migration runner's transaction.
   Preserve historical migrations, especially the immutable baseline.
3. Start the new API and workers, verify forum history and attachment permissions,
   then publish the web image through the normal GitHub Actions/Komodo rollout.
4. A migration failure rolls back the whole transaction. After a successful
   migration, roll forward; restoring the old application requires the matching
   database restore point and a maintenance window, never old writers against
   the new schema. Retain the restricted archive until operations' retention
   policy authorizes its removal.

## Failure cases to cover

- Missing course mapping, non-human assignment author, orphan evidence, repeated
  migration, ID collision, equal timestamps, duplicate/concurrent submissions.
- Cross-company/course access, revoked enrollment, student publishing/feedback,
  peer submission/attachment reads, private references leaking into the feed.
- Agent relay/generation attribution and frozen conversation audience changes.
- Reload/back/forward and old URLs restoring retired pages or tools.
- Inline publishing/edit/delete, failed saves, attachments, comments, filters,
  per-user/course/type drafts, publishing one draft leaving another intact.
- Composer wide/narrow bounds, send/stop mutual exclusion, stable position,
  cancellation failure, completion, quote/attachments and scroll interactions.

Verification uses the official `@e2e-dev/web` engine and real disposable database
integration. Reports must distinguish completed, skipped and blocked checks.

Release preflight failures: reject missing Komodo credentials or an unknown schema;
check both API processes and both workers stopped before backing up; fail on any
pg_dump, restore, or count mismatch; retain the dump on failure. Restore the old
services only if preflight fails before migration. Never automatically start old
binaries after a successful schema change. A cancelled CI job must not interrupt
production maintenance; main releases therefore queue instead of cancelling.

## Delivered deletion and retention inventory

| Area | Final disposition |
| --- | --- |
| Course creation/editing/content dashboards, objectives, activities, missions, growth, cases, independent resources | Removed their screens, navigation values, clients, routes, applications/repositories and exclusive contracts. Old navigation values normalize to the supported workspace default. |
| Learning Agent tools and automatic teacher operations | Removed objective/activity/mission/evaluation/case tools, mission coordinator, digest generation, attention projections and course-room auto creation. Only forum assignment list/read/private-history/submit tools remain, with frozen-audience checks and relay/generated provenance. |
| Database retirement | `0040` drops knowledge units/dependencies, activities/links, missions/steps, attempts/evaluations/states/cases/actions, course rooms, attention/briefing tables and exclusive visit-watermark fields. Historical migrations remain immutable. |
| Forum authoritative model | Existing `course_forum_posts` becomes the assignment/share authority; submissions, feedback and reactions belong to it. Teacher publication, deadlines, closure and feedback use current course grants. |
| Minimum course context | Course IDs, project memberships/invitations, teacher/student role and lifecycle authorization remain necessary to isolate forum access; they do not restore course-management UI or APIs. |
| Shared infrastructure | Knowledge storage and authenticated files support assignment references; IM/documents/Canvas, evidence/trust audit, notification transport/preferences and private teacher conversations remain shared services. Retired learning notification producers and pending deliveries are removed/cancelled. |
| Historical records | Exact old records are retained in the restricted `course_forum_retirement_archive`; original attempts/evidence/evaluations are also attached to mapped submission/feedback rows. Unmapped counts are emitted without content, and archived private file keys cannot use uploader fallback. No archive browsing API exists. |
| Historical message schema | Decoder tags for persisted learning cards remain so old IM messages still deserialize; their retired interactive rendering and write paths are removed. No compatibility business service remains. |

`learning` in permission/capability/module names is the retained forum access
namespace. Generic assistant explanations and shared evidence records are not
course-objective/activity management. The Memos source/capability matrix is in
`src/features/learning/forum/memos/README.md`.

## Repeatable release checks

Use Node 22 and local PostgreSQL/Redis from `e2e/server/compose.yaml`:

```sh
npm run lint && npm run typecheck && npm test && npm run build
npm run server:lint && npm run server:typecheck && npm run server:test
npm run test:e2e:typecheck
node e2e/server/forum.mjs --browser
node --import tsx e2e/server/forum-rollout.mjs
```

The forum runner uses a disposable named database, real HTTP authorization and
the official `@e2e-dev/web` Chromium engine. IM transport, users and object
storage are controlled fixtures. The rollout rehearsal uses real PostgreSQL
backup/restore and a local HTTP fixture for Komodo service updates. Optional
live-provider/production-runtime tests are reported as skipped when their
external configuration is absent.

The main release runs `prepare-forum-rollout.mjs` before the normal Komodo
procedure: inspect schema through `RunStackService`, stop both API writers then
both workers with 150-second drain allowance, create a private custom-format dump,
restore it into a scratch database, compare retained-business counts and record
the SHA-256. Dump/restore failures restart the stopped old services before any
migration. A completed schema 40 skips maintenance on later rollouts. The
production dump is under the PostgreSQL volume's
`forum-upgrade-backups/<release SHA>/product.dump`, with restore list and hash.
After migration, recovery is a new release or an explicit matched DB/image
restore; the script never automatically starts old writers against schema 40.

The release includes upstream native memory/group collaboration migration `0039`
and LingxiOS `3.4.1`; forum convergence is the next migration `0040`. Both
schema 38 and 39 require the verified maintenance backup before this release.
