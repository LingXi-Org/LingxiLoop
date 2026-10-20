### 🔴 e2e: 2 failed, 36 passed

**🔴 Public activity presentation › client public-receipt render budget**  
`e2e/web/activity-presentation.e2e.ts:10`

**ENGINE_FAILURE** at step 2 of 2: `browser.evaluate`, after 57ms

> evaluate failed: page.evaluate: Execution context was destroyed, most likely because of a navigation

- Screen: `/e2e/run-activity.html?public=1&bench=1`

Evidence: screenshot `artifacts/combined-formal358-ui-cached/artifacts/web/e2e_web_activity-presentation.e2e.ts__Public_20activity_20presentation__client_20public-receipt_20render_20budg-90cf3231/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/combined-formal358-ui-cached/artifacts/web/e2e_web_activity-presentation.e2e.ts__Public_20activity_20presentation__client_20public-receipt_20render_20budg-90cf3231/default/attempt-0/trace/trace.zip`, log `artifacts/combined-formal358-ui-cached/artifacts/web/e2e_web_activity-presentation.e2e.ts__Public_20activity_20presentation__client_20public-receipt_20render_20budg-90cf3231/default/attempt-0/failure/screen.txt` · Details: `artifacts/combined-formal358-ui-cached/failures/e2e_web_activity-presentation.e2e.ts-Public_activity_presentation-client_public-receipt_render_budget-35a2db44-077187b5.md`

**🔴 Public run activity › math fonts load through the production asset pipeline**  
`e2e/web/run-activity.e2e.ts:75`

**EVALUATE_FAILED** at step 2 of 2: `browser.evaluate`, after 41ms

> A network error occurred.

- Screen: `/e2e/run-activity.html`

Evidence: screenshot `artifacts/combined-formal358-ui-cached/artifacts/web/e2e_web_run-activity.e2e.ts__Public_20run_20activity__math_20fonts_20load_20through_20the_20production_20asset_-fd3e194e/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/combined-formal358-ui-cached/artifacts/web/e2e_web_run-activity.e2e.ts__Public_20run_20activity__math_20fonts_20load_20through_20the_20production_20asset_-fd3e194e/default/attempt-0/trace/trace.zip`, log `artifacts/combined-formal358-ui-cached/artifacts/web/e2e_web_run-activity.e2e.ts__Public_20run_20activity__math_20fonts_20load_20through_20the_20production_20asset_-fd3e194e/default/attempt-0/failure/screen.txt` · Details: `artifacts/combined-formal358-ui-cached/failures/e2e_web_run-activity.e2e.ts-Public_run_activity-math_fonts_load_through_the_production_asset_pipeline-171438a1-7f66627d.md`

<details>
<summary>All 38 tests in 10 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/activity-presentation.e2e.ts** · 1 failed, 2 passed | 14.1s |
| 🔴 | Public activity presentation › client public-receipt render budget | 6.3s |
| 🟢 | Public activity presentation › known aliases, persisted generic titles and distinct official cards 390 | 4.2s |
| 🟢 | Public activity presentation › known aliases, persisted generic titles and distinct official cards 1440 | 3.6s |
| 🔴 | **e2e/web/run-activity.e2e.ts** · 1 failed, 6 passed | 30.0s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay light 390 | 5.6s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay light 1440 | 5.8s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay dark 390 | 4.8s |
| 🟢 | Public run activity › native chronology, Markdown, attention and replay dark 1440 | 5.4s |
| 🟢 | Public run activity › long histories keep early calls and reveal all later calls | 4.2s |
| 🟢 | Public run activity › wire history pages replace the page while answer and attention stay visible | 2.4s |
| 🔴 | Public run activity › math fonts load through the production asset pipeline | 1.8s |
| 🟢 | **e2e/chat-213/appearance.e2e.ts** · 3 passed | 17.8s |
| 🟢 | chat controls and Chinese mentions (1440) | 7.4s |
| 🟢 | chat controls and Chinese mentions (390) | 4.4s |
| 🟢 | composer candidates, selected mentions and refreshed history preserve Chinese names and stable IDs | 6.1s |
| 🟢 | **e2e/web/activity-regressions.e2e.ts** · 5 passed | 13.1s |
| 🟢 | Activity integration regressions › latest committed public explanation stays visible through the next tool and terminal history | 3.7s |
| 🟢 | Activity integration regressions › memory renders with the product context and reloads authorized history | 3.4s |
| 🟢 | Activity integration regressions › memory empty is explicit and recoverable | 1.9s |
| 🟢 | Activity integration regressions › memory loading is explicit and recoverable | 1.8s |
| 🟢 | Activity integration regressions › memory load-error is explicit and recoverable | 2.3s |
| 🟢 | **e2e/web/memory-privacy.e2e.ts** · 3 passed | 33.3s |
| 🟢 | Official memory activity › forget invalidates cards from two runs without receipt fallback | 2.8s |
| 🟢 | Official memory activity › memory activity, attention and forgetting (1440) | 15.9s |
| 🟢 | Official memory activity › memory activity, attention and forgetting (390) | 14.6s |
| 🟢 | **e2e/web/public-activity-history.e2e.ts** · 2 passed | 4.9s |
| 🟢 | Public activity history › a changed attention history resets the old offset without hiding current explanation or answer | 2.7s |
| 🟢 | Public activity history › the captured Worker final answer appears once while its durable source remains in history | 2.2s |
| 🟢 | **e2e/web/streaming-lifecycle.e2e.ts** · 4 passed | 11.7s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on cancelled | 2.3s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on error | 2.3s |
| 🟢 | Streaming Text lifecycle › reduced motion settles this part without retraction and a new part can stream | 3.9s |
| 🟢 | Streaming Text lifecycle › normal completion drains pending text and replaced history stays static | 3.2s |
| 🟢 | **e2e/web/streaming-tail-window.e2e.ts** · 3 passed | 6.6s |
| 🟢 | Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word | 1.8s |
| 🟢 | Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries | 2.6s |
| 🟢 | Whole text-part streaming tail › visualize text slices share the original text-part window | 2.3s |
| 🟢 | **e2e/web/streaming-text.e2e.ts** · 7 passed | 23.6s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (light) | 4.5s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (dark) | 4.9s |
| 🟢 | Streaming renderer › completion drains pending text and cancellation clears decoration | 2.8s |
| 🟢 | Streaming renderer › reduced motion preference bypasses the reveal queue | 1.9s |
| 🟢 | Official element integration › same input retains upstream entry, color transition and caret styles | 2.8s |
| 🟢 | Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks | 3.4s |
| 🟢 | Official element integration › failure, replacement and history retain text without decoration | 3.3s |
| 🟢 | **e2e/web/streaming-visualize-identity.e2e.ts** · 1 passed | 2.8s |
| 🟢 | Visualize streaming identity › new original activity part starts a fresh Visualize slice motion lifetime | 2.8s |
</details>

<sub>e2e 0.17.0 · 2m 40s · web</sub>
