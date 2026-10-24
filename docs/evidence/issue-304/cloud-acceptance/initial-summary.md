### 🔴 e2e: 1 failed, 13 passed

**🔴 real reduced motion disables process and task motion without removing keyboard actions**  
`e2e/answer-first/cloud-acceptance/reduced.e2e.ts:31`

**ASSERTION_FAILED**

> expected \[{"found":true,"transition":"none","animation":"none"},{"found":true,"transition":"none","animation":"none"},{"found":true,"transition":"all","animation":"none"}\] to equal \[{"found":true,"transition":"none","animation":"none"},{"found":true,"transition":"none","animation":"none"},{"found":true,"transition":"none","animation":"none"}\]

- Screen: `/e2e/answer-first.html`

Evidence: screenshot `.e2e/answer-first-cloud/results/reduced-real-reduced-motion-disables-3273bd47136c2a11/attempt-1/screenshots/001-failure.png`, log `.e2e/answer-first-cloud/results/reduced-real-reduced-motion-disables-3273bd47136c2a11/attempt-1/screen-at-failure.txt` · Trace: `.e2e/answer-first-cloud/results/reduced-real-reduced-motion-disables-3273bd47136c2a11/trace.md`

<details>
<summary>All 14 tests in 7 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/answer-first/cloud-acceptance/reduced.e2e.ts** · 1 failed | 3.3s |
| 🔴 | real reduced motion disables process and task motion without removing keyboard actions | 3.3s |
| 🟢 | **e2e/answer-first/attention.e2e.ts** · 2 passed | 20.7s |
| 🟢 | native interrupt and awaiting_input have one actionable continuation | 10.7s |
| 🟢 | current approval has one external action and replay cannot submit it again | 10.0s |
| 🟢 | **e2e/answer-first/history.e2e.ts** · 2 passed | 12.9s |
| 🟢 | bounded history retries in one process entry without replacing live answer or repeating entries | 6.7s |
| 🟢 | late history page cannot replace newer live data or new-request content | 6.1s |
| 🟢 | **e2e/answer-first/layout.e2e.ts** · 4 passed | 25.2s |
| 🟢 | one process disclosure contains ordinary rich tools while answer and results stay outside | 10.5s |
| 🟢 | manual reading position is not pulled to the bottom by new stream frames or process disclosure | 8.4s |
| 🟢 | copy while the process is expanded contains only the current answer | 2.5s |
| 🟢 | 390px light and dark keep the answer readable and process keyboard accessible | 3.8s |
| 🟢 | **e2e/answer-first/narrow-acceptance.e2e.ts** · 1 passed | 4.2s |
| 🟢 | 390px real process disclosure stays framed and keyboard usable in light and dark themes | 4.2s |
| 🟢 | **e2e/answer-first/v2-stream.e2e.ts** · 2 passed | 6.2s |
| 🟢 | real v2 first character, pending acceptance and final handoff preserve answer DOM and selection | 2.5s |
| 🟢 | real superseded candidate leaves the main answer and correction receives a new identity | 3.6s |
| 🟢 | **e2e/answer-first/visualize.e2e.ts** · 2 passed | 6.7s |
| 🟢 | completed replay preserves the visualization and owner change rebinds acquisition | 3.5s |
| 🟢 | a late old-owner acquisition cannot activate inside the new owner card | 3.2s |
</details>

<sub>e2e 0.21.2 · 1m 34s · reduced-motion</sub>
