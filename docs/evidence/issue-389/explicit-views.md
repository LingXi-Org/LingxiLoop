# Explicit reader and management views (#389)

Development baseline: `11dd55d0f166e060369de323b7c1333447876f45`, including the
merged #397 investigation and #383 interactive covers. The branch is rebased on
`64b4246dc565f5ff549ce67d44608d214ee43a9c`; its intervening change only updates
the unrelated cover VM isolation contract test. This continuation does not
establish that the original production report was reproduced. Keep #389 open
until the original account-role/content observation is identified.

## Confirmed code gaps and intended behavior

- The old list/detail projection chose the draft whenever the actor was a
  `TEACHER`, even when opening the ordinary library. The default is now the
  published reader view for every role. Management is explicit via API
  `view=manage` and browser `caseView=manage`, and requires `cases:manage`.
- Management capability and displayed snapshot are separate. Teachers retain
  their existing management permission; they enter **管理案例** before editing.
  Writes return the management snapshot and its current optimistic-lock version.
- Reader version, update time, ordering, search, categories and generated cover
  come from the published snapshot. Saving an unpublished revision no longer
  advances the reader's revision metadata or changes its ordering.
- A teacher role alone previously allowed draft attachment and cover reads when
  the organization was `READ_ONLY`, despite `cases:manage` being denied by the
  existing policy. Draft reads now use that policy; published reads remain
  available under `cases:read`.
- View transitions cancel stale reads, invalidate mutation completions and select
  the corresponding cover polling view. Unpublished management details return
  to the reader list when selecting **阅读案例**.

## File boundary

Product changes are limited to the cases application/contracts/router and the
cases page/API/view helper. The merged cover repository, worker, renderer,
sandbox, assets and schema are preserved. Cover changes in the application/page
only select or authorize the existing draft/published snapshot and keep polling,
retry and backfill in management view. No migration, dependency lock, access
policy, credential, network configuration or production manifest changes.

Regression changes are limited to the existing organization-cases/case-covers
integration files, the cases view helper test, the existing draft-visibility
browser journey, and explicit management URLs in existing case browser fixtures.
Only the focused draft-visibility journey is run; the URL compatibility updates
are not a claim that all browser suites were rerun.

## Validation and limits

All database and browser identities are synthetic and task-owned. Integration and browser runs
use separate local PostgreSQL test databases and Redis databases. There are no
production writes, private student records, live model requests or independent
review runs.

The fresh environment initially supplied LingxiOS `3.5.2` in both root and server
installation trees while both locks specify the official `3.8.12`. The first
`npm ci` failed because the default cache was unwritable; the workspace cache
succeeded. Installing only the root initially left the old server package
shadowing it, causing missing exports, type failures and a migration provenance
refusal before behavioral assertions. Synchronizing the server lock resolved
that startup problem. The two installation trees also select different Zod and
Node type versions, so final validation uses the CI layout: root `npm ci` only,
with the task's nested server installation moved aside reversibly. No lock,
identity, package source or validation guard was changed.

- Before implementation, the two owning integration files recorded five actual
  failures: default teacher draft list and cover selection, reader revision
  metadata, and READ_ONLY draft attachment and cover authorization.
- Final owning PostgreSQL/HTTP integration: **25/25 passed**, zero skipped
  (`organization-cases`: 12; `case-covers`: 13). Existing concurrency, publication,
  retrieval, attachment, organization and cover lease boundaries remain covered.
- Case view/API unit checks: **3/3 passed**. Changed product/test file lint,
  focused case E2E TypeScript and `git diff --check` passed.
- Web production build (including web typecheck) and server typecheck passed.
- Browser fixture: one workflow collected, **zero tests started**. Chromium
  aborted because the environment's SUID sandbox helper ownership/permissions
  are invalid. No browser assertion, screenshot or original-incident reproduction
  is claimed. No sandbox setting was disabled or changed; see
  [the exact blocker](browser-result.json) and [reproduction](browser-fixture.md).

See [machine-readable checks](explicit-views-checks.json) and
[final integration timings](server-final-timings.json). No independent review,
broader test matrix, merge or production deployment was performed.
