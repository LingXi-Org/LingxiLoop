### 🔴 e2e: 1 failed, 6 passed

**🔴 all 14 default blocks and official free math and diagram blocks remain insertable**  
`e2e/content-editor/browser.e2e.ts:84`

**ASSERTION_FAILED**

> expected "\[{\\"id\\":\\"64658c30-9e2d-44aa-b618-be9d73d33f94\\",\\"type\\":\\"heading\\",\\"props\\":{\\"backgroundColor\\":\\"default\\",\\"textColor\\":\\"default\\",\\"textAlignment\\":\\"left\\",\\"level\\":1,\\"isToggleable\\":false},\\"content\\":\[{\\"type\\":\\"text\\",\\"text\\":\\"原生粗体\\",\\"styles\\":{}}\],\\"children\\":\[\]}\]" to contain "\\"bold\\":true"

- Screen: `/e2e/content-editor.html`

Evidence: screenshot `.codex-tmp/content-boundary-final/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/screenshots/001-failure.png`, trace `.codex-tmp/content-boundary-final/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/trace/trace.zip`, log `.codex-tmp/content-boundary-final/artifacts/native/e2e_content-editor_browser.e2e.ts__all_2014_20default_20blocks_20and_20official_20free_20math_20and_20diagram_2-128a25db/default/attempt-0/failure/screen.txt` · Details: `.codex-tmp/content-boundary-final/failures/e2e_content-editor_browser.e2e.ts-all_14_default_blocks_and_official_free_math_and_diagram_blocks_remain_insert-306429ff-dd9dc116.md`

<details>
<summary>All 7 tests in 2 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/content-editor/browser.e2e.ts** · 1 failed, 3 passed | 29.6s |
| 🟢 | case GFM imports retain literal HTML text, currency and setext headings | 1.8s |
| 🟢 | upstream native schema, slash menus, tables, blocks, undo and lossless reopen | 4.8s |
| 🔴 | all 14 default blocks and official free math and diagram blocks remain insertable | 14.7s |
| 🟢 | native formatting, links, emoji, block menu and table operations remain complete | 8.4s |
| 🟢 | **e2e/content-boundaries/browser.e2e.ts** · 3 passed | 20.6s |
| 🟢 | legacy criteria keep separate native paragraphs on edit and reopen: plain | 13.6s |
| 🟢 | legacy criteria keep separate native paragraphs on edit and reopen: multiline-literal | 5.0s |
| 🟢 | private legacy recovery remains available after editing current content | 2.0s |
</details>

<sub>e2e 0.17.0 · 50.9s · native</sub>
