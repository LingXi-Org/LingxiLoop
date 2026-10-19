### 🔴 e2e: 2 failed, 1 passed

**🔴 copy-image native write fulfills and supplies a real PNG**  
`e2e/visualize/clipboard-write.e2e.ts:42`

**ASSERTION_FAILED**

> expected "native-rejected" to be "observed"

Details: `.e2e/visualize-functional-final/failures/e2e_visualize_clipboard-write.e2e.ts-copy-image_native_write_fulfills_and_supplies_a_real_PNG-ad56e509-ec70c30e.md`

**🔴 page capacity reclaims hidden guests and restores the oldest saved state**  
`e2e/visualize/lifecycle.e2e.ts:98`

**EVALUATE_FAILED** at step 13 of 13: `browser.evaluate`, after 40.0s

> Fixture page 41 did not become ready

Details: `.e2e/visualize-functional-final/failures/e2e_visualize_lifecycle.e2e.ts-page_capacity_reclaims_hidden_guests_and_restores_the_oldest_saved_state-449bc681-1b1084fa.md`

<details>
<summary>All 3 tests in 3 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/visualize/clipboard-write.e2e.ts** · 1 failed | 59.1s |
| 🔴 | copy-image native write fulfills and supplies a real PNG | 59.1s |
| 🔴 | **e2e/visualize/lifecycle.e2e.ts** · 1 failed | 5m 23s |
| 🔴 | page capacity reclaims hidden guests and restores the oldest saved state | 5m 23s |
| 🟢 | **e2e/visualize/bridge.e2e.ts** · 1 passed | 1m 41s |
| 🟢 | stale page operations fail, explicit retry replaces the guest and scope close releases pages | 1m 41s |
</details>

<sub>e2e 0.17.0 · 8m 45s · web</sub>
