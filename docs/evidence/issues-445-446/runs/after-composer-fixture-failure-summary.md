### 🔴 e2e: 1 failed

**🔴 normal and compact composers retain input, menus, attachment, quote and stop without learning shortcuts**  
`e2e/chat-layout/layout.e2e.ts:171`

**ASSERTION_FAILED** at step 38 of 38: `expect.toBeVisible getByRole("button", name: "停止全部智能助教")`, after 15.1s

- Expected: visible
- Observed: no node (0 matches)
- Screen: `/e2e/chat-layout/index.html`

Evidence: screenshot `.e2e/chat-layout-after-composer/artifacts/web/e2e_chat-layout_layout.e2e.ts__normal_20and_20compact_20composers_20retain_20input_2C_20menus_2C_20attachment_2-71fa16cb/default/attempt-0/screenshots/003-failure.png`, screenshot `.e2e/chat-layout-after-composer/artifacts/web/e2e_chat-layout_layout.e2e.ts__normal_20and_20compact_20composers_20retain_20input_2C_20menus_2C_20attachment_2-71fa16cb/default/attempt-0/screenshots/001-after-composer-normal-1440.png`, log `.e2e/chat-layout-after-composer/artifacts/web/e2e_chat-layout_layout.e2e.ts__normal_20and_20compact_20composers_20retain_20input_2C_20menus_2C_20attachment_2-71fa16cb/default/attempt-0/failure/screen.txt` · Details: `.e2e/chat-layout-after-composer/failures/e2e_chat-layout_layout.e2e.ts-normal_and_compact_composers_retain_input__menus__attachment__quote_and_stop_with-8830f13b-4f03af38.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/chat-layout/layout.e2e.ts** · 1 failed | 17.5s |
| 🔴 | normal and compact composers retain input, menus, attachment, quote and stop without learning shortcuts | 17.5s |
</details>

<sub>e2e 0.17.0 · 18.3s · web</sub>
