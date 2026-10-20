# Issue 219 acceptance

Draft PR [#223](https://github.com/LingXi-Org/LingxiLoop/pull/223). No deployment, merge or issue closure by this task. The sole integrator owns independent review, combined migration/runtime validation and production rollout.

## Task and layout evidence

[AUDIT.md](AUDIT.md) records the actual starting workflows and design decisions. [BLOCKNOTE.md](BLOCKNOTE.md) records the exact official source, MPL license, entry-point mapping and free/provider-dependent boundaries. [DEPENDENCIES.md](DEPENDENCIES.md) names shared lockfile effects.

Case list: remove the marketing header and blank-cover cards; use aligned article rows and optional actual thumbnails. Search, category and author actions stay above the list. The first title moves from approximately y=547 to y=183 at 1440×1000. Reading uses a constrained article width; authoring keeps draft/published state and existing version checks.

Forum: remove the fixed 250px desktop calendar column and repeated filter rows; keep course sections, search/property/date controls and the leading composer together. Dates use the existing calendar in a popover; mobile navigation remains a Sheet. Display preferences, materials, source references, tags, private submissions and teacher review keep their distinct roles. Collapsed composer measurements are 51px tall at 1440 and 390px widths, with no document overflow in the measured states.

Before screenshots use main b7b165fd. The candidate incorporates main 0a7fd57c. Final fetched main is 0e93870f (PR227); its shared streaming/package changes require combined integration checks, as recorded in DEPENDENCIES.md. Case comparison viewports are 1440×1000 and 390×900; forum comparisons are 1440×960 and 390×960. Synthetic identities and representative content are retained. Dynamic timestamps and generated attachment IDs differ.

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
node e2e/server/forum.mjs --browser-only --core-only
node e2e/server/forum.mjs --browser-only --states-only
node e2e/server/forum.mjs --browser-only --issue184
npm run lint
npm run server:lint
npm run server:typecheck
npm run test:e2e:typecheck
npm test
npm run build
```

Each database runner applies migrations twice. Migration 0048 only adds nullable columns with `IF NOT EXISTS`; it does not rewrite or delete original text/history. Roll back the application while retaining these columns. Native records include the exact Markdown projection and original legacy source; readers detect old-writer projection mismatches. Do not drop the columns as an application rollback step.

Validation uses the official tester-army/e2e engine (`e2e` 0.17.0 and `@e2e-dev/web` 0.12.0). Fixtures use disposable identities, loopback HTTP, PostgreSQL and in-memory object storage. Homework frozen answer/report/review tests use recorded IM and a loopback malformed-provider response to validate the existing truthful unverified fallback; they do not claim live AI quality. Chinese text and composition lifecycle were exercised; hardware IME and physical mobile keyboards were not.

## Final verification inventory

Production source is fixed at `1a5f1f871319ffa7433a2748191869eb39be8907`; [checks/final-source.json](checks/final-source.json) records hashes of every changed production source/lock/config file. The final build runs in an isolated checkout of that commit against the same exact installed root dependencies, avoiding generated visualization asset reloads during browser tests. Later changes are test synchronization and evidence only.

| Check | Result and evidence |
|---|---|
| Owning cases/forum/homework HTTP + PostgreSQL integration | 58/58; [log](checks/owning-integration.txt), [driver](checks/owning-driver.json) |
| Existing web tests | 65/65; [log](checks/web-test.txt) |
| Web/server lint, web/server/E2E typecheck | Passed; [web lint](checks/web-lint.txt), [server lint](checks/server-lint.txt), [server types](checks/candidate-server-typecheck.txt), [E2E types](checks/e2e-typecheck.txt). Build includes web/node typecheck |
| Production build | Passed at `1a5f1f87`; [log](checks/build.txt). Existing large-chunk and CSS `::highlight` warnings retained |
| Cases loading/retry, publication/images, organization isolation and JSON reopen | 3/3; [report](after/cases/report.json), run `01a1578b-1ca3-74b2-8b7a-924855258995` |
| Full native controls and legacy dialects | 4/4; [report](after/native/report.json), run `01a15780-9624-7841-8070-8ed3d6942070` |
| #219 forum, private feedback, frozen homework lifecycle | 3/3; [report](after/forum/report.json), run `01a15784-c4b0-7622-805c-51de972e769c` |
| Forum loading/error/retry/empty/mobile keyboard | 1/1; [report](after/states/report.json), run `01a1578a-cc7b-739e-b7e9-b1f079a80601` |
| Same-fixture forum comparison, materials, mobile/focus/themes and assignment permissions | 3/3; [report](after/comparison-forum/report.json), run `01a1578b-7005-79c7-a7c2-182efa91e164` |
| Existing historical forum workflows | Full run 9/10, then affected core 1/1; [full retained report](after/regression/report.json), [core rerun](after/core/report.json), run `01a15782-7c02-7ce5-8358-6c9eaef8a66c`. All ten existing cases have a passing result, but this is **not** a single 10/10 run |

The historical core rerun preserves its business assertions and uses scoped native editors and the actual formula popup. The full run also covers the unchanged shared chat composer at desktop/mobile, #146 navigation, #163 draft/avatar behavior, #184 responsive/material/assignment flows, resources and retired routes. The final metadata-only change preserves hard breaks when deriving plain titles; its exact title is asserted in the final #219 run. Native editor/controller source is unchanged since its recorded passing run.

A later cases repetition exposed an early click immediately after reload; [failure record](checks/case-reload-timing-failure.json) is retained. The test now waits for the native article heading and visible edit control before entering edit mode; no business assertion was removed. Earlier native toolbar overflow, shared Vite cache identity, literal HTML and dependency-resolution failures remain in `checks/` with their correction notes in the audit.

## Remaining integration gate

At production-source commit `1a5f1f87`, GitHub changes and web/admin/control/server/deploy-contract checks pass. Integration fails before tests because this independent PR contains assigned 0048 while #216-owned 0047 is not yet on main: `expected 47, found 48`. [Exact job and status](checks/ci-migration-dependency.json). Local validation borrowed the exact #216 checkpoint file only; it is **not committed** here and does not validate the final runtime schema13 combination. Do not manufacture 0047, skip sequence validation or treat local results as release CI. The sole integrator must merge the real #216 dependency, reconcile shared locks, run exact combined CI and independently review before rollout.
