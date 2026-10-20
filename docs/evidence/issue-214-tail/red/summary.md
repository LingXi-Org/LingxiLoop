### 🔴 e2e: 2 failed

**🔴 Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word**  
`e2e/web/streaming-tail-window.e2e.ts:32`

**ASSERTION_FAILED**

> expected \[{"text":"one two","fresh":\["one","two"\]},{"text":"","fresh":\[\]},{"text":"one\\t two","fresh":\["\\t ","two"\]},{"text":"甲 乙","fresh":\["甲","乙"\]},{"text":"","fresh":\[\]}\] to equal \[{"text":"one two","fresh":\["one","two"\]},{"text":"one two","fresh":\["one","two"\]},{"text":"one\\t two","fresh":\["one","two"\]},{"text":"甲 乙","fresh":\["甲","乙"\]},{"text":"甲 乙","fresh":\["甲","乙"\]}\]

- Screen: `/scripts/streaming-browser-check.html`

Evidence: screenshot `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__inline_20boundaries_20preserve_20wh-e0a058db/default/attempt-0/screenshots/001-failure.png`, trace `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__inline_20boundaries_20preserve_20wh-e0a058db/default/attempt-0/trace/trace.zip`, log `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__inline_20boundaries_20preserve_20wh-e0a058db/default/attempt-0/failure/screen.txt` · Details: `docs/evidence/issue-214-tail/red/failures/e2e_web_streaming-tail-window.e2e.ts-Whole_text-part_streaming_tail-inline_boundaries_preserve_whitespace_witho-bde503ae-bbdd611a.md`

**🔴 Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries**  
`e2e/web/streaming-tail-window.e2e.ts:62`

**ASSERTION_FAILED**

> expected \[{"fresh":\["one","two"\],"carets":1},{"fresh":\["one","two","three"\],"carets":1},{"fresh":\["one","two","three","four"\],"carets":1},{"fresh":\["甲","乙","丙"\],"carets":1},{"fresh":\[\],"carets":0},{"fresh":\["甲","乙","丙"\],"carets":1}\] to equal \[{"fresh":\["one","two"\],"carets":1},{"fresh":\["two","three"\],"carets":1},{"fresh":\["three","four"\],"carets":1},{"fresh":\["乙","丙"\],"carets":1},{"fresh":\["乙","丙"\],"carets":1},{"fresh":\["乙","丙"\],"carets":1}\]

- Screen: `/scripts/streaming-browser-check.html`

Evidence: screenshot `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/screenshots/001-failure.png`, trace `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/trace/trace.zip`, log `docs/evidence/issue-214-tail/red/artifacts/web/e2e_web_streaming-tail-window.e2e.ts__Whole_20text-part_20streaming_20tail__one_20word_20in_20a_20new_20block_2-84b70b33/default/attempt-0/failure/screen.txt` · Details: `docs/evidence/issue-214-tail/red/failures/e2e_web_streaming-tail-window.e2e.ts-Whole_text-part_streaming_tail-one_word_in_a_new_block_retains_the_precedi-b9451ea7-1f3c17fe.md`

<details>
<summary>All 2 tests in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/streaming-tail-window.e2e.ts** · 2 failed | 7.4s |
| 🔴 | Whole text-part streaming tail › inline boundaries preserve whitespace without counting it as a word | 5.8s |
| 🔴 | Whole text-part streaming tail › one word in a new block retains the preceding word across structural boundaries | 1.6s |
</details>

<sub>e2e 0.17.0 · 8.2s · web</sub>
