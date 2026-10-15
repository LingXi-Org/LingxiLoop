# Forum resource library redesign — 2026-10-15

The forum's 资料 navigation now opens a dedicated resource browser inside the existing forum shell. It has no post composer, feed controls or Memos cards. The current branch had retired the resources navigation; this change reconnects the existing project-source API without creating another resource store.

## Design research

Inspected the official screenshots and documentation of these open-source projects:

- [Cloudreve](https://github.com/cloudreve/cloudreve), [official screenshot](https://raw.githubusercontent.com/cloudreve/docs/master/images/homepage.png): stable left navigation, a separate upload action, file categories, and explicit list/grid controls. Applied these patterns to the forum shell without copying upstream code.
- [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx), [official document table](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/assets/screenshots/documents-table.png): a document-centric toolbar and scannable metadata columns. Applied searchable names/links, visibility filters, sort controls and file metadata instead of social feed cards.

The final minimalist revision removes the breadcrumb, introductory copy, category cards, colorful icon backgrounds and duplicate upload panel. A compact filter row and neutral icons leave the focus on actual resources. All colors use the existing theme, including dark mode. The upload dialog separates file selection, removal and submission; accepts multiple files, URLs and pasted text; explains visibility; and retains failed upload attempts. Successfully uploaded File objects are remembered during retries to prevent duplicate creation after partial failure.

## Validation

- `npm run lint`: passed, existing unrelated warnings only.
- `npm run typecheck`: passed.
- `npm test`: 87 passed, zero failures/skips.
- `npm run build`: passed.
- `XDG_CACHE_HOME=/workspace/.lingxi-setup/cache node e2e/server/forum.mjs --browser-only`: 5 browser tests passed on the initial redesign; the final minimal revision passes its focused resource journey, using tester-army/e2e and the official @e2e-dev/web engine.
- `npm run test:e2e:typecheck`: blocked by an existing error at `server/src/agent-runtime/delivery.ts:92` (TS2367: the published runtime's reason union excludes `mention_limit`). The same code exists at the baseline commit; this change does not modify that server code. The new test has no reported type errors.

The new browser journey covers the retained sidebar, absent post composer, real file/text/URL requests, partial upload failure and retry without duplication, search/no-results, category filtering, list/grid switching, rename/detail, desktop light/dark, a 390px mobile viewport without horizontal overflow, return to discussions, and teacher-shared/student-private visibility across different identities.

For the final minimal revision, run `XDG_CACHE_HOME=/workspace/.lingxi-setup/cache node e2e/server/forum.mjs --browser-only --resources-only`. The full rerun after concurrent main commit `24a4f1c5` passed 4 tests and failed the old retirement-navigation test: that commit restores course routes and renames the sidebar entry to 论坛, while the old test expects 学习论坛. This unrelated navigation assertion was not weakened or removed.

Browser tests use the disposable PostgreSQL forum fixture, synthetic teacher/student/peer authentication, and the existing in-memory object-storage adapter. Source ingestion is left queued; external Notebook extraction, production object storage and production login are not verified by this fixture. Runtime permissions, source visibility and storage/ingestion APIs remain unchanged.

Screenshots and the native runner summary are retained here. Re-run the command above to reproduce them from the fixture; no production data is used.
