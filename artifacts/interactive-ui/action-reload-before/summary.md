### 🔴 e2e: 1 failed

**🔴 Composable interactive explanations › reloading after a save conflict keeps an unconfirmed action retryable with the same identity**  
`node_modules/e2e/dist/expect/async.js:112`

**ASSERTION_FAILED** at step 9 of 9: `expect.toBeEnabled getByRole("button", name: "重试提交")`, after 15.1s

- Expected: enabled
- Observed: no node (0 matches)
- Screen: `/e2e/interactive-ui.html?mode=action-reload`

Evidence: screenshot `artifacts/interactive-ui/action-reload-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__reloading_20after_20a_20save_20conflict-19c19b94/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/interactive-ui/action-reload-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__reloading_20after_20a_20save_20conflict-19c19b94/default/attempt-0/trace/trace.zip`, log `artifacts/interactive-ui/action-reload-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__reloading_20after_20a_20save_20conflict-19c19b94/default/attempt-0/failure/screen.txt` · Details: `artifacts/interactive-ui/action-reload-before/failures/e2e_web_interactive-ui.e2e.ts-Composable_interactive_explanations-reloading_after_a_save_conflict_keeps_an_unco-f83b65cb-712246ea.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/interactive-ui.e2e.ts** · 1 failed | 27.5s |
| 🔴 | Composable interactive explanations › reloading after a save conflict keeps an unconfirmed action retryable with the same identity | 27.5s |
</details>

<sub>e2e 0.17.0 · 29.3s · web</sub>
