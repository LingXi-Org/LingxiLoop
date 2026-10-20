### 🟢 e2e: 6 passed

<details>
<summary>All 6 tests in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🟢 | **e2e/canvas-app/document.e2e.ts** · 6 passed | 24.2s |
| 🟢 | official SDK edits a legacy document, retains one live page and stages explicit feedback | 6.7s |
| 🟢 | remote revision conflicts preserve the draft, reload is explicit, preview remains live | 3.8s |
| 🟢 | lost save response is reconciled by readback and survives reload without replaying the write | 3.9s |
| 🟢 | forged parent messages cannot call tools and scope invalidation closes the App | 2.3s |
| 🟢 | late save ACK retains newer remote revision and typing during the pending save | 3.8s |
| 🟢 | same-source SDK requests reject undeclared capabilities and honor request cancellation | 3.7s |
</details>

<sub>e2e 0.17.0 · 25.4s · web</sub>
