### 🔴 e2e: 2 failed, 13 passed

**🔴 Streaming Text lifecycle › normal completion drains pending text and replaced history stays static**  
`e2e/web/streaming-lifecycle.e2e.ts:116`

**ASSERTION_FAILED**

> expected false to be true

- Screen: `/scripts/streaming-lifecycle-check.html`

Evidence: screenshot `artifacts/root-combined-green/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__normal_20completion_20drains_20pending_20text-0d86a8ff/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/root-combined-green/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__normal_20completion_20drains_20pending_20text-0d86a8ff/default/attempt-0/trace/trace.zip`, log `artifacts/root-combined-green/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__normal_20completion_20drains_20pending_20text-0d86a8ff/default/attempt-0/failure/screen.txt` · Details: `artifacts/root-combined-green/failures/e2e_web_streaming-lifecycle.e2e.ts-Streaming_Text_lifecycle-normal_completion_drains_pending_text_and_replaced_-92a0cab3-c8b9b94e.md`

**🔴 Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks**  
`e2e/web/streaming-text.e2e.ts:197`

**ASSERTION_FAILED**

> expected 1 to be greater than 3

- Screen: `/scripts/streaming-browser-check.html`

Evidence: screenshot `artifacts/root-combined-green/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/root-combined-green/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/trace/trace.zip`, log `artifacts/root-combined-green/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/failure/screen.txt` · Details: `artifacts/root-combined-green/failures/e2e_web_streaming-text.e2e.ts-Official_element_integration-Chinese_and_mixed_leaves_settle_continuously_without-29916081-91cf0f3f.md`

<details>
<summary>All 15 tests in 4 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/streaming-lifecycle.e2e.ts** · 1 failed, 3 passed | 27.9s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on cancelled | 5.5s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on error | 3.5s |
| 🟢 | Streaming Text lifecycle › reduced motion settles this part without retraction and a new part can stream | 7.5s |
| 🔴 | Streaming Text lifecycle › normal completion drains pending text and replaced history stays static | 11.5s |
| 🔴 | **e2e/web/streaming-text.e2e.ts** · 1 failed, 6 passed | 44.1s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (light) | 8.9s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (dark) | 9.1s |
| 🟢 | Streaming renderer › completion drains pending text and cancellation clears decoration | 5.5s |
| 🟢 | Streaming renderer › reduced motion preference bypasses the reveal queue | 4.1s |
| 🟢 | Official element integration › same input retains upstream entry, color transition and caret styles | 4.8s |
| 🔴 | Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks | 5.8s |
| 🟢 | Official element integration › failure, replacement and history retain text without decoration | 6.0s |
| 🟢 | **e2e/web/streaming-tail-window.e2e.ts** · 3 passed | 19.8s |
| 🟢 | Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word | 6.8s |
| 🟢 | Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries | 6.5s |
| 🟢 | Whole text-part streaming tail › visualize text slices share the original text-part window | 6.5s |
| 🟢 | **e2e/web/streaming-visualize-identity.e2e.ts** · 1 passed | 4.4s |
| 🟢 | Visualize streaming identity › new original activity part starts a fresh Visualize slice motion lifetime | 4.4s |
</details>

<sub>e2e 0.17.0 · 1m 42s · web</sub>
