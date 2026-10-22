### 🔴 e2e: 2 failed, 23 passed

**🔴 partial and blocked delivered artifacts remain visible without being called complete or empty**  
`e2e/answer-first/cloud-acceptance/outcomes.e2e.ts:32`

**LOCATOR_AMBIGUOUS** at step 3 of 3: `expect.toBeVisible getByText("已交付的演示稿")`, after 6ms

> locator matched 2 nodes, expected exactly one: getByText("已交付的演示稿")

- Matched: 2 matches
- Asked for: "已交付的演示稿"
- Screen: `/e2e/answer-first.html`
- Closest to the locator: `#n3010 "打开演示文稿：已交付的演示稿"`, `#n3011 text="已交付的演示稿"`, `#n3013 text="已交付的演示稿"`, and 1 more

Evidence: screenshot `.e2e/answer-first-cloud-final/results/outcomes-partial-and-blocked-delivered-f86e1e89712dc0bf/attempt-1/screenshots/001-failure.png`, log `.e2e/answer-first-cloud-final/results/outcomes-partial-and-blocked-delivered-f86e1e89712dc0bf/attempt-1/screen-at-failure.txt` · Trace: `.e2e/answer-first-cloud-final/results/outcomes-partial-and-blocked-delivered-f86e1e89712dc0bf/trace.md`

**🔴 real reduced motion disables process and task motion without removing keyboard actions**  
`e2e/answer-first/cloud-acceptance/reduced.e2e.ts:32`

**ASSERTION_FAILED**

> expected \[{"found":true,"transition":"none","duration":"1e-05s","animation":"none"},{"found":true,"transition":"none","duration":"1e-05s","animation":"none"},{"found":true,"transition":"all","duration":"1e-05s","animation":"none"}\] to equal \[{"found":true,"transition":"none","duration":"0s","animation":"none"},{"found":true,"transition":"none","duration":"0s","animation":"none"},{"found":true,"transition":"all","duration":"0s","animation":"none"}\]

- Screen: `/e2e/answer-first.html`

Evidence: screenshot `.e2e/answer-first-cloud-final/results/reduced-real-reduced-motion-disables-3273bd47136c2a11/attempt-1/screenshots/001-failure.png`, log `.e2e/answer-first-cloud-final/results/reduced-real-reduced-motion-disables-3273bd47136c2a11/attempt-1/screen-at-failure.txt` · Trace: `.e2e/answer-first-cloud-final/results/reduced-real-reduced-motion-disables-3273bd47136c2a11/trace.md`

<details>
<summary>All 25 tests in 9 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/answer-first/cloud-acceptance/outcomes.e2e.ts** · 1 failed, 2 passed | 12.0s |
| 🟢 | failed cancelled and incomplete runs retain body and honest process status | 4.4s |
| 🔴 | partial and blocked delivered artifacts remain visible without being called complete or empty | 2.9s |
| 🟢 | approval without control stays discoverable and non-actionable across disclosure and reload | 4.7s |
| 🔴 | **e2e/answer-first/cloud-acceptance/reduced.e2e.ts** · 1 failed | 3.2s |
| 🔴 | real reduced motion disables process and task motion without removing keyboard actions | 3.2s |
| 🟢 | **e2e/answer-first/attention.e2e.ts** · 2 passed | 7.5s |
| 🟢 | native interrupt and awaiting_input have one actionable continuation | 3.5s |
| 🟢 | current approval has one external action and replay cannot submit it again | 4.0s |
| 🟢 | **e2e/answer-first/history.e2e.ts** · 2 passed | 12.8s |
| 🟢 | bounded history retries in one process entry without replacing live answer or repeating entries | 6.3s |
| 🟢 | late history page cannot replace newer live data or new-request content | 6.5s |
| 🟢 | **e2e/answer-first/layout.e2e.ts** · 4 passed | 31.3s |
| 🟢 | one process disclosure contains ordinary rich tools while answer and results stay outside | 11.0s |
| 🟢 | manual reading position is not pulled to the bottom by new stream frames or process disclosure | 13.0s |
| 🟢 | copy while the process is expanded contains only the current answer | 3.9s |
| 🟢 | 390px light and dark keep the answer readable and process keyboard accessible | 3.4s |
| 🟢 | **e2e/answer-first/narrow-acceptance.e2e.ts** · 1 passed | 10.3s |
| 🟢 | 390px real process disclosure stays framed and keyboard usable in light and dark themes | 10.3s |
| 🟢 | **e2e/answer-first/v2-stream.e2e.ts** · 2 passed | 12.1s |
| 🟢 | real v2 first character, pending acceptance and final handoff preserve answer DOM and selection | 7.9s |
| 🟢 | real superseded candidate leaves the main answer and correction receives a new identity | 4.2s |
| 🟢 | **e2e/answer-first/visualize.e2e.ts** · 2 passed | 6.7s |
| 🟢 | completed replay preserves the visualization and owner change rebinds acquisition | 3.5s |
| 🟢 | a late old-owner acquisition cannot activate inside the new owner card | 3.2s |
| 🟢 | **e2e/web/questionnaire.e2e.ts** · 8 passed | 24.2s |
| 🟢 | durable questionnaire › trusted questionnaire binding replaces generic continuation forms | 2.7s |
| 🟢 | durable questionnaire › unread status blocks submission; waiting stays idle until explicit submit | 3.7s |
| 🟢 | durable questionnaire › durable answers render read-only without answer history and refresh never posts | 2.6s |
| 🟢 | durable questionnaire › double clicks submit once; failure retries and refresh preserves accepted answers | 3.7s |
| 🟢 | durable questionnaire › a lost accepted response reconciles canonical answers before another POST | 2.5s |
| 🟢 | durable questionnaire › pending submission freezes saved answers and retries only those values | 2.1s |
| 🟢 | durable questionnaire › an exhausted resume keeps canonical answers and requires one explicit recovery | 3.5s |
| 🟢 | durable questionnaire › unavailable and foreign owner cards stay disabled; loading failure can reload | 3.4s |
</details>

<sub>e2e 0.21.2 · 2m 15s · reduced-motion</sub>
