### 🟢 e2e: 15 passed

<details>
<summary>All 15 tests in 4 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🟢 | **.codex-tmp/canvas-final-356/document.e2e.ts** · 6 passed | 29.6s |
| 🟢 | official SDK edits a legacy document, retains one live page and stages explicit feedback | 7.6s |
| 🟢 | remote revision conflicts preserve the draft, reload is explicit, preview remains live | 4.3s |
| 🟢 | lost save response is reconciled by readback and survives reload without replaying the write | 5.8s |
| 🟢 | forged parent messages cannot call tools and scope invalidation closes the App | 3.1s |
| 🟢 | late save ACK retains newer remote revision and typing during the pending save | 4.9s |
| 🟢 | same-source SDK requests reject undeclared capabilities and honor request cancellation | 3.9s |
| 🟢 | **.codex-tmp/canvas-final-356/draft-failures.e2e.ts** · 3 passed | 17.0s |
| 🟢 | save conflict readback retains undo and leave protection after failure | 6.3s |
| 🟢 | reload http-failure retains input generation and the original CAS baseline | 6.2s |
| 🟢 | reload sdk-cancellation retains input generation and the original CAS baseline | 4.5s |
| 🟢 | **.codex-tmp/canvas-final-356/draft-races.e2e.ts** · 4 passed | 31.8s |
| 🟢 | save notifications retain an undo to the former baseline and the next save uses the acknowledged revision | 6.5s |
| 🟢 | multiple edits during a pending save preserve the latest draft | 7.8s |
| 🟢 | typing after reload confirmation retains the original CAS baseline: new-text | 9.2s |
| 🟢 | typing after reload confirmation retains the original CAS baseline: undo-to-old-baseline | 8.3s |
| 🟢 | **.codex-tmp/canvas-final-356/feedback-scope.e2e.ts** · 2 passed | 8.0s |
| 🟢 | staged feedback stops after close-then-switch while the first acknowledgement is pending | 4.0s |
| 🟢 | staged feedback stops after scope-aba while the first acknowledgement is pending | 4.1s |
</details>

<sub>e2e 0.17.0 · 1m 28s · web</sub>
