### 🔴 e2e: 1 failed, 6 passed

**🔴 all 14 default blocks and official free math and diagram blocks remain insertable**  
`e2e/content-editor/browser.e2e.ts:82`

**LOCATOR_AMBIGUOUS** at step 164 of 164: `expect.toBeVisible locator("[aria-label=\"原生正文\"] [data-content-type=\"paragraph\"]")`, after 28ms

> locator matched 5 nodes, expected exactly one: locator("\[aria-label=\\"原生正文\\"\] \[data-content-type=\\"paragraph\\"\]")

- Matched: 5 matches
- Screen: `/e2e/content-editor.html`

Evidence: screenshot `.codex-tmp/pr219-main-prep/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/screenshots/001-failure.png`, trace `.codex-tmp/pr219-main-prep/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/trace/trace.zip`, log `.codex-tmp/pr219-main-prep/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/failure/screen.txt` · Details: `.codex-tmp/pr219-main-prep/failures/e2e_content-editor_browser.e2e.ts-all_14_default_blocks_and_official_free_math_and_diagram_blocks_remain_insert-306429ff-dd9dc116.md`

<details>
<summary>All 7 tests in 2 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/content-editor/browser.e2e.ts** · 1 failed, 3 passed | 26.4s |
| 🟢 | case GFM imports retain literal HTML text, currency and setext headings | 1.3s |
| 🟢 | upstream native schema, slash menus, tables, blocks, undo and lossless reopen | 4.1s |
| 🔴 | all 14 default blocks and official free math and diagram blocks remain insertable | 12.9s |
| 🟢 | native formatting, links, emoji, block menu and table operations remain complete | 8.1s |
| 🟢 | **e2e/content-boundaries/browser.e2e.ts** · 3 passed | 11.6s |
| 🟢 | legacy criteria keep separate native paragraphs on edit and reopen: plain | 5.6s |
| 🟢 | legacy criteria keep separate native paragraphs on edit and reopen: multiline-literal | 4.5s |
| 🟢 | private legacy recovery remains available after editing current content | 1.5s |
</details>

<sub>e2e 0.17.0 · 38.7s · native</sub>
