### 🔴 e2e: 1 failed, 1 passed

**🔴 conversation rows keep two equal lines through status changes and virtual scrolling**  
`e2e/chat-layout/layout.e2e.ts:22`

**ASSERTION_FAILED** at step 3 of 3: `expect.toBeVisible locator("[data-index=\"0\"] [data-slot=\"item\"]")`, after 15.0s

- Expected: visible
- Observed: no node (0 matches)
- Screen: `/e2e/chat-layout/index.html`

Evidence: screenshot `.e2e/chat-layout-before/artifacts/web/e2e_chat-layout_layout.e2e.ts__conversation_20rows_20keep_20two_20equal_20lines_20through_20status_20changes_20-534b3ff2/default/attempt-0/screenshots/001-failure.png`, log `.e2e/chat-layout-before/artifacts/web/e2e_chat-layout_layout.e2e.ts__conversation_20rows_20keep_20two_20equal_20lines_20through_20status_20changes_20-534b3ff2/default/attempt-0/failure/screen.txt` · Details: `.e2e/chat-layout-before/failures/e2e_chat-layout_layout.e2e.ts-conversation_rows_keep_two_equal_lines_through_status_changes_and_virtual_scrolli-bf670fac-a7519cac.md`

<details>
<summary>All 2 tests in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/chat-layout/layout.e2e.ts** · 1 failed, 1 passed | 18.2s |
| 🔴 | conversation rows keep two equal lines through status changes and virtual scrolling | 16.3s |
| 🟢 | normal and compact composers retain input, menus, attachment, quote and stop without learning shortcuts | 1.9s |
</details>

<sub>e2e 0.17.0 · 18.9s · web</sub>
