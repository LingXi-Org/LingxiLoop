### 🔴 e2e: 1 failed, 34 passed

**🔴 Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks**  
`e2e/web/streaming-text.e2e.ts:203`

**ASSERTION_FAILED**

> expected true to be false

- Screen: `/scripts/streaming-browser-check.html`

Evidence: screenshot `artifacts/ui-release-combination-after-space/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/ui-release-combination-after-space/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/trace/trace.zip`, log `artifacts/ui-release-combination-after-space/artifacts/web/e2e_web_streaming-text.e2e.ts__Official_20element_20integration__Chinese_20and_20mixed_20leaves_20settle_20cont-8388ac22/default/attempt-0/failure/screen.txt` · Details: `artifacts/ui-release-combination-after-space/failures/e2e_web_streaming-text.e2e.ts-Official_element_integration-Chinese_and_mixed_leaves_settle_continuously_without-29916081-91cf0f3f.md`

<details>
<summary>All 35 tests in 9 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/streaming-text.e2e.ts** · 1 failed, 6 passed | 33.0s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (light) | 5.1s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (dark) | 5.2s |
| 🟢 | Streaming renderer › completion drains pending text and cancellation clears decoration | 2.6s |
| 🟢 | Streaming renderer › reduced motion preference bypasses the reveal queue | 2.8s |
| 🟢 | Official element integration › same input retains upstream entry, color transition and caret styles | 4.2s |
| 🔴 | Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks | 6.0s |
| 🟢 | Official element integration › failure, replacement and history retain text without decoration | 7.2s |
| 🟢 | **e2e/chat-213/appearance.e2e.ts** · 3 passed | 17.4s |
| 🟢 | chat controls and Chinese mentions (1440) | 6.0s |
| 🟢 | chat controls and Chinese mentions (390) | 5.4s |
| 🟢 | composer candidates, selected mentions and refreshed history preserve Chinese names and stable IDs | 6.0s |
| 🟢 | **e2e/web/activity-presentation.e2e.ts** · 3 passed | 7.4s |
| 🟢 | Public activity presentation › client public-receipt render budget | 1.6s |
| 🟢 | Public activity presentation › known aliases, persisted generic titles and distinct official cards 390 | 2.8s |
| 🟢 | Public activity presentation › known aliases, persisted generic titles and distinct official cards 1440 | 2.9s |
| 🟢 | **e2e/web/activity-regressions.e2e.ts** · 5 passed | 11.9s |
| 🟢 | Activity integration regressions › latest committed public explanation stays visible through the next tool and terminal history | 2.7s |
| 🟢 | Activity integration regressions › memory renders with the product context and reloads authorized history | 3.1s |
| 🟢 | Activity integration regressions › memory empty is explicit and recoverable | 2.1s |
| 🟢 | Activity integration regressions › memory loading is explicit and recoverable | 1.9s |
| 🟢 | Activity integration regressions › memory load-error is explicit and recoverable | 2.2s |
| 🟢 | **e2e/web/memory-privacy.e2e.ts** · 2 passed | 31.3s |
| 🟢 | Official memory activity › memory activity, attention and forgetting (1440) | 15.4s |
| 🟢 | Official memory activity › memory activity, attention and forgetting (390) | 15.9s |
| 🟢 | **e2e/web/run-activity.e2e.ts** · 7 passed | 28.8s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay light 390 | 5.0s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay light 1440 | 5.4s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay dark 390 | 4.8s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay dark 1440 | 4.8s |
| 🟢 | Public run activity › long histories keep early calls and reveal all later calls | 4.5s |
| 🟢 | Public run activity › wire history pages replace the page while answer and attention stay visible | 2.6s |
| 🟢 | Public run activity › math fonts load through the production asset pipeline | 1.8s |
| 🟢 | **e2e/web/streaming-lifecycle.e2e.ts** · 4 passed | 14.5s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on cancelled | 2.2s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on error | 2.4s |
| 🟢 | Streaming Text lifecycle › reduced motion settles this part without retraction and a new part can stream | 5.5s |
| 🟢 | Streaming Text lifecycle › normal completion drains pending text and replaced history stays static | 4.4s |
| 🟢 | **e2e/web/streaming-tail-window.e2e.ts** · 3 passed | 7.4s |
| 🟢 | Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word | 2.0s |
| 🟢 | Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries | 2.9s |
| 🟢 | Whole text-part streaming tail › visualize text slices share the original text-part window | 2.4s |
| 🟢 | **e2e/web/streaming-visualize-identity.e2e.ts** · 1 passed | 4.7s |
| 🟢 | Visualize streaming identity › new original activity part starts a fresh Visualize slice motion lifetime | 4.7s |
</details>

<sub>e2e 0.17.0 · 2m 39s · web</sub>
