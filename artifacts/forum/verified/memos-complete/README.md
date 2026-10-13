# Forum / Memos acceptance evidence

Recorded on 2026-10-13 using the repository's official `e2e` 0.17.0 runner and `@e2e-dev/web` 0.12.0 engine. These are existing execution artifacts; evidence collection did not rerun tests or change application code.

- [Browser report](../../browser/report.json): run `01a13589-d688-7b77-af84-ea87a3f6cded`, 1 passed, 0 failed, 0 skipped; test duration 89.603 seconds. [JUnit](../../browser/junit.xml) independently records the same result.
- [Browser driver result](../../browser-results.json): migrations and browser command exited 0, finishing at `2026-10-13T13:54:43.882Z`.
- [Integration result](../../results.json) and [captured output](integration.txt): 6 passed, 0 failed, 0 skipped; migration 0038 applied and a second migration invocation was already current.
- The browser report captured Git HEAD `65146d7d` with `dirty: true`. Commit `c42bc754` was created during the run. This is working-tree acceptance evidence, not a clean-checkout or production deployment claim.

The browser journey covers submission history and latest-version display, peer file denial, teacher moderation and closure, keyboard focus, Memos editor shortcuts, restored drafts, empty/read-only draft prevention and identity-scoped retention, rich text rendering (tables, highlighted code, KaTeX and Mermaid), post/comment attachments, search highlighting and mobile layout. See [the test source](../../../../e2e/forum/browser.e2e.ts) and [fixture scope](../../../../e2e/forum/README.md).

## Screenshots

All eight PNG files are retained under [the browser artifacts directory](../../browser/artifacts/forum/e2e_forum_browser.e2e.ts__forum_20history_2C_20public_20resources_2C_20student_20versions_2C_20private_20files_-559b79e3/default/attempt-0/screenshots/). Each file's SHA-256 was checked against the browser report, and all eight were visually inspected during evidence collection.

| File | Visible evidence |
| --- | --- |
| `001-student-submission-history.png` | Revised answer marked version 2; history expanded |
| `002-memos-editor-shortcuts.png` | Main post editor, formatting toolbar, draft actions and attachment controls |
| `003-memos-editor-preview.png` | Rich preview with table, code, equation and diagram |
| `004-memos-attachment-preview.png` | Attachment preview dialog and download control |
| `005-memos-detail-and-comments.png` | Rendered discussion and attached comment file |
| `006-forum-mobile-dark-keyboard.png` | Mobile feed, focused timestamp and highlighted search match |
| `007-memos-mobile-dark-discussion.png` | Mobile discussion dialog and rich body |
| `008-forum-desktop.png` | Desktop light-theme forum post |

Suggested review pair: `002-memos-editor-shortcuts.png` and `007-memos-mobile-dark-discussion.png`. The image fixture is a 68-byte PNG, so the attachment screenshot establishes the dialog flow, not realistic image quality. Mobile screenshots capture the visible viewport; long code scrolls within its block and content continues below the fold.

## Earlier failure

[Version-order observations](version-clock-failure.json), [screen text](version-clock-failure-screen.txt) and [screenshot](version-clock-failure.png) preserve the earlier failure from run `01a13578-9931-7336-9ce0-edf7a7cf9aff`. The second request contained the revised answer, but its observed database timestamp was earlier than the original answer. A database wall-clock rollback is consistent with those observations; host clock correction was not instrumented and is not established as the cause. The integration regression exercises future and equal timestamps while checking accepted submission order.

## Repeat

From the repository root, with the repository dependencies and official Chromium engine installed:

```sh
docker compose -f e2e/server/compose.yaml up -d --wait
node e2e/server/forum.mjs --browser
```

For browser-only validation after migration, use `node e2e/server/forum.mjs --browser-only`; for integration only, use `node e2e/server/forum.mjs`. The runner uses the disposable local `lingxiloop_forum_test` database, PostgreSQL port 55432, Redis port 56379/database 4, API 53097 and web 53098. It writes fresh results under `artifacts/forum` and stops its API/web child processes afterward.

Synthetic identities, in-memory object storage and recorded WuKong messages bound this run. Real gateway login, external storage delivery, live model generation and production deployment were not checked by this evidence set. Earlier files directly under `verified/` belong to prior acceptance runs.
