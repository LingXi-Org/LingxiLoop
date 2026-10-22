### 🟢 e2e: 8 passed

<details>
<summary>All 8 tests in 4 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🟢 | **e2e/answer-first/attention.e2e.ts** · 2 passed | 9.7s |
| 🟢 | native interrupt and awaiting_input have one actionable continuation | 3.8s |
| 🟢 | current approval has one external action and replay cannot submit it again | 5.9s |
| 🟢 | **e2e/answer-first/history.e2e.ts** · 2 passed | 15.7s |
| 🟢 | bounded history retries in one process entry without replacing live answer or repeating entries | 8.7s |
| 🟢 | late history page cannot replace newer live data or new-request content | 7.0s |
| 🟢 | **e2e/answer-first/v2-stream.e2e.ts** · 2 passed | 8.8s |
| 🟢 | real v2 first character, pending acceptance and final handoff preserve answer DOM and selection | 3.9s |
| 🟢 | real superseded candidate leaves the main answer and correction receives a new identity | 4.9s |
| 🟢 | **e2e/answer-first/visualize.e2e.ts** · 2 passed | 12.9s |
| 🟢 | completed replay preserves the visualization and owner change rebinds acquisition | 6.6s |
| 🟢 | a late old-owner acquisition cannot activate inside the new owner card | 6.3s |
</details>

<sub>e2e 0.17.0 · 49.9s · desktop</sub>
