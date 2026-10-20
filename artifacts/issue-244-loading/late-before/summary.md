### 🔴 e2e: 1 failed

**🔴 a late committed acquisition cannot revoke a successful retry**  
`e2e/visualize/late-create.e2e.ts:18`

**LOCATOR_NOT_FOUND** at step 10 of 10: `expect.toHaveText frameLocator("iframe[data-visualize-guest]:visible") >> frameLocator("iframe[data-visualize-content]") >> locator("#fixture-status")`, after 10.0s

> no frame matches iframe\[data-visualize-guest\]:visible: frameLocator("iframe\[data-visualize-guest\]:visible") &gt;&gt; frameLocator("iframe\[data-visualize-content\]") &gt;&gt; locator("#fixture-status")

- Screen: `/e2e/visualize/loading.html?count=1`

Evidence: screenshot `.e2e/244-late-before/artifacts/web/e2e_visualize_late-create.e2e.ts__a_20late_20committed_20acquisition_20cannot_20revoke_20a_20successful_20retry-23c615df/default/attempt-0/screenshots/001-failure.png`, trace `.e2e/244-late-before/artifacts/web/e2e_visualize_late-create.e2e.ts__a_20late_20committed_20acquisition_20cannot_20revoke_20a_20successful_20retry-23c615df/default/attempt-0/trace/trace.zip`, log `.e2e/244-late-before/artifacts/web/e2e_visualize_late-create.e2e.ts__a_20late_20committed_20acquisition_20cannot_20revoke_20a_20successful_20retry-23c615df/default/attempt-0/failure/screen.txt` · Details: `.e2e/244-late-before/failures/e2e_visualize_late-create.e2e.ts-a_late_committed_acquisition_cannot_revoke_a_successful_retry-354d1473-9a5721a1.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/visualize/late-create.e2e.ts** · 1 failed | 30.0s |
| 🔴 | a late committed acquisition cannot revoke a successful retry | 30.0s |
</details>

<sub>e2e 0.17.0 · 32.8s · web</sub>
