### 🔴 e2e: 1 failed

**🔴 Composable interactive explanations › an unconfirmed newer result keeps the committed revision editable until native delivery**  
`node_modules/e2e/dist/expect/async.js:112`

**ASSERTION_FAILED** at step 2 of 2: `expect.toBeEnabled locator("[data-revision=\"1\"]") >> getByRole("slider", name: "发射角度")`, after 15.1s

- Expected: enabled
- Observed: states: disabled (1 match)
- Screen: `/e2e/interactive-ui.html?mode=revision-pending`

Evidence: screenshot `artifacts/interactive-ui/revision-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__an_20unconfirmed_20newer_20result_20kee-fe85c659/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/interactive-ui/revision-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__an_20unconfirmed_20newer_20result_20kee-fe85c659/default/attempt-0/trace/trace.zip`, log `artifacts/interactive-ui/revision-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__an_20unconfirmed_20newer_20result_20kee-fe85c659/default/attempt-0/failure/screen.txt` · Details: `artifacts/interactive-ui/revision-before/failures/e2e_web_interactive-ui.e2e.ts-Composable_interactive_explanations-an_unconfirmed_newer_result_keeps_the_committ-c55e620d-273005f2.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/interactive-ui.e2e.ts** · 1 failed | 16.8s |
| 🔴 | Composable interactive explanations › an unconfirmed newer result keeps the committed revision editable until native delivery | 16.8s |
</details>

<sub>e2e 0.17.0 · 18.6s · web</sub>
