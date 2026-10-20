### 🟢 e2e: 8 passed

<details>
<summary>All 8 tests in 2 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🟢 | **.codex-tmp/pr212-security/compatibility.e2e.ts** · 6 passed | 50.0s |
| 🟢 | official SDK edits a legacy document, retains one live page and stages explicit feedback | 12.1s |
| 🟢 | remote revision conflicts preserve the draft, reload is explicit, preview remains live | 11.7s |
| 🟢 | lost save response is reconciled by readback and survives reload without replaying the write | 10.4s |
| 🟢 | forged parent messages cannot call tools and scope invalidation closes the App | 4.6s |
| 🟢 | late save ACK retains newer remote revision and typing during the pending save | 6.2s |
| 🟢 | same-source SDK requests reject undeclared capabilities and honor request cancellation | 4.9s |
| 🟢 | **e2e/canvas-app/feedback-scope.e2e.ts** · 2 passed | 10.3s |
| 🟢 | staged feedback stops after close-then-switch while the first acknowledgement is pending | 5.2s |
| 🟢 | staged feedback stops after scope-aba while the first acknowledgement is pending | 5.1s |
</details>

<sub>e2e 0.17.0 · 1m 2s · web</sub>
