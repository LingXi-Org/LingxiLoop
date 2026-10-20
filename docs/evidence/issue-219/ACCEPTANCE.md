# Issue 219 acceptance

Draft PR [#223](https://github.com/LingXi-Org/LingxiLoop/pull/223). No deployment, merge or issue closure by this task. The sole integrator owns independent review, combined migration/runtime validation and production rollout.

## Task and layout evidence

[AUDIT.md](AUDIT.md) records the actual starting workflows and design decisions. [BLOCKNOTE.md](BLOCKNOTE.md) records the exact official source, MPL license, entry-point mapping and free/provider-dependent boundaries. [DEPENDENCIES.md](DEPENDENCIES.md) names shared lockfile effects.

Case list: remove the marketing header and blank-cover cards; use aligned article rows and optional actual thumbnails. Search, category and author actions stay above the list. The first title moves from approximately y=547 to y=183 at 1440×1000. Reading uses a constrained article width; authoring keeps draft/published state and existing version checks.

Forum: remove the fixed 250px desktop calendar column and repeated filter rows; keep course sections, search/property/date controls and the leading composer together. Dates use the existing calendar in a popover; mobile navigation remains a Sheet. Display preferences, materials, source references, tags, private submissions and teacher review keep their distinct roles. Collapsed composer measurements are 51px tall at 1440 and 390px widths, with no document overflow in the measured states.

Before screenshots use main b7b165fd. The candidate incorporates main 0a7fd57c. Case comparison viewports are 1440×1000 and 390×900; forum comparisons are 1440×960 and 390×960. Synthetic identities and representative content are retained. Dynamic timestamps and generated attachment IDs differ.

## Native coverage

| Upstream capability | Repeatable evidence |
|---|---|
| All 14 default block types, official math block and diagram | Native browser inserts each through the official slash menu, saves and reopens |
| Native inline formula, block formula, Mermaid, code language | Legacy import fixture asserts native inline node, visible MathML/SVG and retained original source |
| Bold, italic, underline, strike, color, alignment, inline code | Native formatting buttons/official keyboard shortcut; saved block properties asserted |
| Link popup, emoji grid, block menu, table add row/column | Native browser performs the real interactions and verifies result; link Enter does not publish the business form |
| Undo/redo, table cell keyboard movement, JSON integrity | Native browser asserts undo/redo and exact repeated-save JSON equality |
| File/audio/video/image blocks | All native blocks and panels retained; actual business image upload/save/read tested, plus existing material upload/download flows |
| Post/comment, legacy submission/feedback, homework requirements/criteria/answer/acceptance | Forum 219 browser uses real HTTP/PostgreSQL, reloads native state and checks private file access |
| Case summary/body | Cases browser authors native formatting/image, saves/publishes and reopens exact JSON |
| Drag/side/file/table controllers, responsive/mobile native UI | Official default components remain intact; source inventory plus representative UI operations above. No handwritten replacement menus |

The source inventory is `packages/react/src/editor/BlockNoteDefaultUI.tsx` at the recorded upstream commit. There is no promise that every possible input permutation was exercised. Optional external collaboration/comment providers and paid XL/hosted products were not added. Existing product collaboration and permissions are preserved.

## Reproduction and data safety

Use Node 22.23.3 and the exact root lock. Start the repository disposable PostgreSQL/Redis from `e2e/server/compose.yaml`, install the official browser with the repository script, and provide the exact #216 migration 0047 documented in [checks/migration-dependency.md](checks/migration-dependency.md) before testing #219 migration 0048.

```sh
npm ci
npm run test:e2e:install
node e2e/server/content-editor.mjs --integration-only
node e2e/server/content-editor.mjs --browser-only
node e2e/server/cases.mjs --browser-only
node e2e/server/forum.mjs --browser-only --issue219
node e2e/server/forum.mjs --browser-only
npm run lint
npm run server:lint
npm run server:typecheck
npm run test:e2e:typecheck
npm test
npm run build
```

Each database runner applies migrations twice. Migration 0048 only adds nullable columns with `IF NOT EXISTS`; it does not rewrite or delete original text/history. Roll back the application while retaining these columns. Native records include the exact Markdown projection and original legacy source; readers detect old-writer projection mismatches. Do not drop the columns as an application rollback step.

Validation uses the official tester-army/e2e engine (`e2e` 0.17.0 and `@e2e-dev/web` 0.12.0). Fixtures use disposable identities, loopback HTTP, PostgreSQL and in-memory object storage. Homework frozen answer/report/review tests use recorded IM and a loopback malformed-provider response to validate the existing truthful unverified fallback; they do not claim live AI quality. Chinese text and composition lifecycle were exercised; hardware IME and physical mobile keyboards were not.

Final run inventory is recorded below after the remaining checks settle.
