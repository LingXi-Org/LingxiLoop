### 🟢 e2e: 11 passed

<details>
<summary>All 11 tests in 2 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🟢 | **e2e/web/auth.e2e.ts** · 7 passed | 10.9s |
| 🟢 | Public authentication › signed-out visitors get labelled login fields and no open registration | 3.0s |
| 🟢 | Public authentication › password recovery returns to login without losing the entry point | 1.3s |
| 🟢 | Public authentication › reset links reject an invalid token with a visible error | 1.6s |
| 🟢 | Public authentication › invalid invitation is explained instead of leaving a blank app: /invite/e2e-invalid-invitation | 1.1s |
| 🟢 | Public authentication › invalid invitation is explained instead of leaving a blank app: /invite/project/e2e-invalid-invitation | 1.2s |
| 🟢 | Public authentication › invalid invitation is explained instead of leaving a blank app: /#invite=%25 | 1.3s |
| 🟢 | Public authentication › login and password recovery fit a phone viewport | 1.5s |
| 🟢 | **perf/bench/guards.e2e.ts** · 4 passed | 25.0s |
| 🟢 | notification window keeps its separate renderer | 1.7s |
| 🟢 | chat defers canvas fonts and both canvas entry points still open | 8.8s |
| 🟢 | settings still open and failed deep links never open an unrelated chat | 9.3s |
| 🟢 | mobile history and drafts survive opening and closing the conversation list | 5.2s |
</details>

<sub>e2e 0.17.0 · 38.7s · web</sub>
