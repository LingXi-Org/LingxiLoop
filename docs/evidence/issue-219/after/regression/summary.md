### 🔴 e2e: 1 failed, 9 passed

**🔴 inline Memos lifecycle, drafts, moderation, assignments and private history**  
`e2e/forum/browser.e2e.ts:65`

**LOCATOR_AMBIGUOUS** at step 56 of 56: `expect.toBeVisible getByRole("region", name: "发布学习论坛内容") >> getByRole("alert")`, after 183ms

> locator matched 2 nodes, expected exactly one: getByRole("region", name: "发布学习论坛内容") &gt;&gt; getByRole("alert")

- Matched: 2 matches
- Asked for: alert
- Screen: `/?project=e2e-classroom&view=forum`
- Closest to the locator: `#n171 alert "服务暂时不可用，请稍后再试。"`

Evidence: screenshot `artifacts/forum/browser/artifacts/forum/e2e_forum_browser.e2e.ts__inline_20Memos_20lifecycle_2C_20drafts_2C_20moderation_2C_20assignments_20and_20priva-306b8071/default/attempt-0/screenshots/003-failure.png`, screenshot `artifacts/forum/browser/artifacts/forum/e2e_forum_browser.e2e.ts__inline_20Memos_20lifecycle_2C_20drafts_2C_20moderation_2C_20assignments_20and_20priva-306b8071/default/attempt-0/screenshots/001-student-inline-light.png`, trace `artifacts/forum/browser/artifacts/forum/e2e_forum_browser.e2e.ts__inline_20Memos_20lifecycle_2C_20drafts_2C_20moderation_2C_20assignments_20and_20priva-306b8071/default/attempt-0/trace/trace.zip`, log `artifacts/forum/browser/artifacts/forum/e2e_forum_browser.e2e.ts__inline_20Memos_20lifecycle_2C_20drafts_2C_20moderation_2C_20assignments_20and_20priva-306b8071/default/attempt-0/failure/screen.txt` · Details: `artifacts/forum/browser/failures/e2e_forum_browser.e2e.ts-inline_Memos_lifecycle__drafts__moderation__assignments_and_private_history-ec853eba-7ef6e92b.md`

<details>
<summary>All 10 tests in 7 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/forum/browser.e2e.ts** · 1 failed | 1m 21s |
| 🔴 | inline Memos lifecycle, drafts, moderation, assignments and private history | 1m 21s |
| 🟢 | **e2e/forum/composer.e2e.ts** · 2 passed | 49.6s |
| 🟢 | composer bounds, cancellation, completion and blur (1440) | 37.0s |
| 🟢 | composer bounds, cancellation, completion and blur (390) | 12.6s |
| 🟢 | **e2e/forum/issue146.e2e.ts** · 1 passed | 56.4s |
| 🟢 | Memos page navigation, collapsed full-roster search, frozen references and mandatory assessment | 56.4s |
| 🟢 | **e2e/forum/issue163.e2e.ts** · 1 passed | 2m 16s |
| 🟢 | compact inline editor preserves drafts and binds every avatar to its account | 2m 16s |
| 🟢 | **e2e/forum/issue184.e2e.ts** · 3 passed | 2m 3s |
| 🟢 | issue184 materials, body links, upload states, drafts and publish retry use real forum routes | 55.6s |
| 🟢 | issue184 responsive focus canvas: compact, editor, closed/open materials, focus mode and both themes | 40.2s |
| 🟢 | issue184 formal assignment fields survive mode switches and student permission stays enforced | 27.6s |
| 🟢 | **e2e/forum/resources.e2e.ts** · 1 passed | 12.6s |
| 🟢 | forum offers only assignments and discussions on desktop and mobile | 12.6s |
| 🟢 | **e2e/forum/retirement.e2e.ts** · 1 passed | 10.1s |
| 🟢 | retired learning URLs, reload and browser history cannot restore old screens | 10.1s |
</details>

<sub>e2e 0.17.0 · 7m 55s · forum</sub>
