### 🟢 e2e: 10 passed

<details>
<summary>All 10 tests in 2 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🟢 | **e2e/web/streaming-tail-window.e2e.ts** · 3 passed | 9.4s |
| 🟢 | Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word | 4.5s |
| 🟢 | Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries | 2.8s |
| 🟢 | Whole text-part streaming tail › visualize text slices share the original text-part window | 2.1s |
| 🟢 | **e2e/web/streaming-text.e2e.ts** · 7 passed | 28.9s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (light) | 5.7s |
| 🟢 | Streaming renderer › bursts reveal continuously and the tail settles (dark) | 5.5s |
| 🟢 | Streaming renderer › completion drains pending text and cancellation clears decoration | 2.8s |
| 🟢 | Streaming renderer › reduced motion preference bypasses the reveal queue | 2.0s |
| 🟢 | Official element integration › same input retains upstream entry, color transition and caret styles | 2.9s |
| 🟢 | Official element integration › Chinese and mixed leaves settle continuously without replaying stable blocks | 3.5s |
| 🟢 | Official element integration › failure, replacement and history retain text without decoration | 6.5s |
</details>

<sub>e2e 0.17.0 · 39.3s · web</sub>
