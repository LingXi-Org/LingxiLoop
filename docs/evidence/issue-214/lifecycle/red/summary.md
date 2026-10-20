### 🔴 e2e: 3 failed, 1 passed

**🔴 Streaming Text lifecycle › non-last Text immediately settles on cancelled**  
`e2e/web/streaming-lifecycle.e2e.ts:38`

**ASSERTION_FAILED**

> expected false to be true

- Screen: `/scripts/streaming-lifecycle-check.html`

Evidence: screenshot `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__non-last_20Text_20immediately_20settles_20on_-3e77e9d6/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__non-last_20Text_20immediately_20settles_20on_-3e77e9d6/default/attempt-0/trace/trace.zip`, log `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__non-last_20Text_20immediately_20settles_20on_-3e77e9d6/default/attempt-0/failure/screen.txt` · Details: `artifacts/pr220-lifecycle-red/failures/e2e_web_streaming-lifecycle.e2e.ts-Streaming_Text_lifecycle-non-last_Text_immediately_settles_on_cancelled-bcefd87d-851e9ebb.md`

**🔴 Streaming Text lifecycle › non-last Text immediately settles on error**  
`e2e/web/streaming-lifecycle.e2e.ts:38`

**ASSERTION_FAILED**

> expected false to be true

- Screen: `/scripts/streaming-lifecycle-check.html`

Evidence: screenshot `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__non-last_20Text_20immediately_20settles_20on_-e3add322/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__non-last_20Text_20immediately_20settles_20on_-e3add322/default/attempt-0/trace/trace.zip`, log `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__non-last_20Text_20immediately_20settles_20on_-e3add322/default/attempt-0/failure/screen.txt` · Details: `artifacts/pr220-lifecycle-red/failures/e2e_web_streaming-lifecycle.e2e.ts-Streaming_Text_lifecycle-non-last_Text_immediately_settles_on_error-7f2a0f97-1906cf56.md`

**🔴 Streaming Text lifecycle › reduced motion settles this part without retraction and a new part can stream**  
`e2e/web/streaming-lifecycle.e2e.ts:88`

**ASSERTION_FAILED**

> expected false to be true

- Screen: `/scripts/streaming-lifecycle-check.html`

Evidence: screenshot `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__reduced_20motion_20settles_20this_20part_20wi-a793a914/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__reduced_20motion_20settles_20this_20part_20wi-a793a914/default/attempt-0/trace/trace.zip`, log `artifacts/pr220-lifecycle-red/artifacts/web/e2e_web_streaming-lifecycle.e2e.ts__Streaming_20Text_20lifecycle__reduced_20motion_20settles_20this_20part_20wi-a793a914/default/attempt-0/failure/screen.txt` · Details: `artifacts/pr220-lifecycle-red/failures/e2e_web_streaming-lifecycle.e2e.ts-Streaming_Text_lifecycle-reduced_motion_settles_this_part_without_retraction-cbb6ac5f-828486c0.md`

<details>
<summary>All 4 tests in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/streaming-lifecycle.e2e.ts** · 3 failed, 1 passed | 16.7s |
| 🔴 | Streaming Text lifecycle › non-last Text immediately settles on cancelled | 6.7s |
| 🔴 | Streaming Text lifecycle › non-last Text immediately settles on error | 2.9s |
| 🔴 | Streaming Text lifecycle › reduced motion settles this part without retraction and a new part can stream | 4.4s |
| 🟢 | Streaming Text lifecycle › normal completion drains pending text and replaced history stays static | 2.7s |
</details>

<sub>e2e 0.17.0 · 17.5s · web</sub>
