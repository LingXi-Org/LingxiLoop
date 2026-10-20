# Native editor provenance and integration

Official upstream: [TypeCellOS/BlockNote v0.56.0](https://github.com/TypeCellOS/BlockNote/tree/v0.56.0), commit `8e0485caef54abe9cad6b84fa66505e0398acb79`. npm packages include official source and compiled distributions. This integration imports those exact distributions; it does not copy, edit or replace their editor, toolbar, menu, block manipulation or table implementations. `blocknote-provenance.json` records exact lock integrity and upstream source hashes. `licenses/BlockNote-MPL-2.0.txt` retains MPL-2.0.

`src/features/content-editor/ContentEditor.tsx` owns only controlled business values, async upload delegation, serialization, accessible naming and theme. `schema.ts` extends the entire default schema with official free code highlighting, math block/inline and diagram packages. `NativeView.tsx` directly composes the official formatting/slash controllers from upstream examples `04-theming/06-code-block`, `06-custom-schema/09-math-block` and `10-diagram-block`: all default items plus all math/diagram items. The two `false` flags prevent duplicate controllers; the replacement controllers, item factories, toolbar and menus are all upstream components. Link, emoji, side menu, file panel and table controllers retain their upstream defaults. No custom toolbar/menu UI is implemented.

The host CSS only sizes the surrounding canvas and applies product tokens. Native controls and source packages remain unchanged. Case title/category/tags, search, date and explicit URL fields remain semantic structured inputs, not narrative editors.

| Entry | Owning integration | Native storage |
|---|---|---|
| Case summary/body | `CasesPage` | optional versioned docs in existing draft/published JSONB; existing version CAS |
| Post/comment/edit | `ForumContentFields`, `ForumComposer`, `ForumDiscussion`, `ForumCommentEditor` | nullable JSONB alongside text, same transaction |
| Legacy answer and feedback | `ForumSubmission` | answer version and feedback native doc; feedback files bound to same submission |
| Homework requirements/criteria | `HomeworkDraftCard` | docs plus original text/criteria; revision and visibleHash invalidate validation |
| Homework answer/report preview | `HomeworkStudent` | existing answer JSONB, answerRevision and immutable submitted snapshot |
| Homework acceptance | `HomeworkTeacher` | native doc with reason, expectedSubmissionId and private attachment manifest |
| Full reading/history | `ForumBody`, `HomeworkSubmissionView`, case reader | official read-only view; legacy Markdown reader when no matching native doc |
| Existing task check/bulk reset | `CourseForum` | parsed Markdown task state synchronized into native checkListItem blocks |

The canonical record includes blocks, exact text projection, top-level section projection, and the original legacy Markdown. Matching projections are validated at writes. A text-only old client invalidates the native copy; an old binary that edits only the text after rollback is detected by projection mismatch on the next read. No startup or migration rewrites old rows. Native media uses persisted authorized URLs, never blob/demo URLs. Forum native files must appear in the explicit owned attachment list. New teacher-feedback files use the existing same-submission learner/reviewer policy. Case files use the existing case asset namespace, ownership and published-reference gate; covers retain image signature checks and files retain the 8 MB bound.

`legacy.tsx` imports existing Markdown via the product's existing GFM/math parser into the official BlockNote HTML parser, retaining raw source. Official math and Mermaid blocks preserve their rendered business meaning. Fence aliases such as `ts` are normalized to the official language ID before insertion because 0.56's code language selector rejects unnormalized aliases. Unknown languages retain original source and plain code. No-op legacy save retains original TEXT unchanged. Unsupported legacy extensions remain recoverable in `legacyMarkdown`, even when native import/export cannot represent them.

The [official default React UI source](https://github.com/TypeCellOS/BlockNote/blob/v0.56.0/packages/react/src/editor/BlockNoteDefaultUI.tsx) is the feature inventory, not screenshots alone. Default 14 block types: paragraph, heading, bullet/number/check/toggle lists, quote, code, divider, table, image, audio, video, file. All are retained. Formatting, link, emoji, slash, side/drag/block, file and table controls use upstream implementations. Official free math/inline math, Mermaid and syntax-highlighting packages are additionally enabled for existing course content.

[Official licensing/pricing](https://www.blocknotejs.org/pricing) distinguishes the open editor from XL packages and hosted products. No XL AI/multicolumn/export packages, hosted backend or paid subscription was purchased. Optional Yjs collaboration, thread-comment providers and external services need an application provider and storage; those were not existing editing capabilities here and are not claimed as newly deployed. Existing discussion comments, shared course access, submission privacy, case CAS and history remain product-owned.

Verification is split honestly: `e2e/content-editor/browser.e2e.ts` tests the real official editor with synthetic local persistence; cases/forum suites test the real HTTP/PostgreSQL/authorization paths. Hardware IME and live AI/provider judgments are not inferred from synthetic composition events or recorded IM.
