### 🔴 e2e: 1 failed, 2 passed

**🔴 Whole text-part streaming tail › visualize text slices share the original text-part window**  
`e2e/web/streaming-tail-window.e2e.ts:94`

**ASSERTION_FAILED**

> expected {"fresh":\["one","two","three"\],"carets":2} to equal {"fresh":\["two","three"\],"carets":1}

- Screen: `/scripts/streaming-browser-check.html?visualize=1`

Evidence: screenshot `docs/evidence/issue-214-tail/split-red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__visualize_20text_20slices_20share_2-810cc902/default/attempt-0/screenshots/001-failure.png`, trace `docs/evidence/issue-214-tail/split-red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__visualize_20text_20slices_20share_2-810cc902/default/attempt-0/trace/trace.zip`, log `docs/evidence/issue-214-tail/split-red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__visualize_20text_20slices_20share_2-810cc902/default/attempt-0/failure/screen.txt` · Details: `docs/evidence/issue-214-tail/split-red/failures/e2e_web_streaming-tail-window.e2e.ts-Whole_text-part_streaming_tail-visualize_text_slices_share_the_original_te-677d8422-1107aed3.md`

<details>
<summary>All 3 tests in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/streaming-tail-window.e2e.ts** · 1 failed, 2 passed | 13.5s |
| 🟢 | Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word | 9.5s |
| 🟢 | Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries | 2.2s |
| 🔴 | Whole text-part streaming tail › visualize text slices share the original text-part window | 1.7s |
</details>

<sub>e2e 0.17.0 · 14.2s · web</sub>
