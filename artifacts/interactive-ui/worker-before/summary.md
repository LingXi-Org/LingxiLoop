### 🔴 e2e: 1 failed

**🔴 Composable interactive explanations › offscreen simulation cancels its worker and never labels old results as new parameters**  
`node_modules/e2e/dist/expect/async.js:112`

**ASSERTION_FAILED** at step 10 of 10: `expect.toHaveCount locator("[data-result=\"clt\"]")`, after 15.1s

- Expected: count 0
- Observed: count 1 (1 match)
- Screen: `/e2e/interactive-ui.html?scenario=worker`

Evidence: screenshot `artifacts/interactive-ui/worker-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__offscreen_20simulation_20cancels_20its_-6c717a1d/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/interactive-ui/worker-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__offscreen_20simulation_20cancels_20its_-6c717a1d/default/attempt-0/trace/trace.zip`, log `artifacts/interactive-ui/worker-before/artifacts/web/e2e_web_interactive-ui.e2e.ts__Composable_20interactive_20explanations__offscreen_20simulation_20cancels_20its_-6c717a1d/default/attempt-0/failure/screen.txt` · Details: `artifacts/interactive-ui/worker-before/failures/e2e_web_interactive-ui.e2e.ts-Composable_interactive_explanations-offscreen_simulation_cancels_its_worker_and_n-8a96b6a9-6682425a.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/interactive-ui.e2e.ts** · 1 failed | 18.6s |
| 🔴 | Composable interactive explanations › offscreen simulation cancels its worker and never labels old results as new parameters | 18.6s |
</details>

<sub>e2e 0.17.0 · 20.7s · web</sub>
