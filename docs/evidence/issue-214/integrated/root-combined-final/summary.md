### 🟢 e2e: 15 passed

<details>
<summary>All 15 tests in 4 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🟢 | **e2e/web/streaming-lifecycle.e2e.ts** · 4 passed | 15.1s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on cancelled | 2.7s |
| 🟢 | Streaming Text lifecycle › non-last Text immediately settles on error | 3.5s |
| 🟢 | Streaming Text lifecycle › reduced motion settles this part without retraction and a new part can stream | 5.4s |
| 🟢 | Streaming Text lifecycle › normal completion drains pending text and replaced history stays static | 3.6s |
| 🟢 | **e2e/web/streaming-tail-window.e2e.ts** · 3 passed | 8.8s |
| 🟢 | Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word | 2.3s |
| 🟢 | Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries | 3.2s |
| 🟢 | Whole text-part streaming tail › visualize text slices share the original text-part window | 3.2s |
| 🟢 | **e2e/web/streaming-text.e2e.ts** · 7 passed | 25.0s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (light) | 4.8s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (dark) | 5.4s |
| 🟢 | Streaming renderer › completion drains pending text and cancellation clears decoration | 3.0s |
| 🟢 | Streaming renderer › reduced motion preference bypasses the reveal queue | 1.8s |
| 🟢 | Official element integration › same input retains upstream entry, color transition and caret styles | 3.6s |
| 🟢 | Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks | 3.3s |
| 🟢 | Official element integration › failure, replacement and history retain text without decoration | 3.1s |
| 🟢 | **e2e/web/streaming-visualize-identity.e2e.ts** · 1 passed | 2.5s |
| 🟢 | Visualize streaming identity › new original activity part starts a fresh Visualize slice motion lifetime | 2.5s |
</details>

<sub>e2e 0.17.0 · 52.3s · web</sub>
