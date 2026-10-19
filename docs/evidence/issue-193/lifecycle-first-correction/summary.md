### 🔴 e2e: 2 failed, 1 passed

**🔴 stale page operations fail, explicit retry replaces the guest and scope close releases pages**  
`e2e/visualize/bridge.e2e.ts:56`

**ASSERTION_FAILED** at step 9 of 9: `expect.toHaveCount locator("iframe[data-visualize-guest]")`, after 54.2s

- Expected: count 0
- Observed: count 1 (1 match)

Evidence: trace `.e2e/visualize-lifecycle-fixed/artifacts/web/e2e_visualize_bridge.e2e.ts__stale_20page_20operations_20fail_2C_20explicit_20retry_20replaces_20the_20guest_20-65d67f04/default/attempt-0/trace/trace.zip` · Details: `.e2e/visualize-lifecycle-fixed/failures/e2e_visualize_bridge.e2e.ts-stale_page_operations_fail__explicit_retry_replaces_the_guest_and_scope_close_relea-6481b21f-5dc8d9a8.md`

**🔴 page capacity reclaims hidden guests and restores the oldest saved state**  
`e2e/visualize/lifecycle.e2e.ts:90`

**ACTION_FAILED** at step 2 of 2: `locator.tap frameLocator("iframe[data-visualize-guest]:visible") >> frameLocator("iframe[data-visualize-content]") >> getByRole("button", name: "Saved count: 5")`, after 36.1s

> tap did not become actionable in time: locator.click: Timeout 1ms exceeded. Call log: - waiting for locator('iframe\[data-visualize-guest\]:visible').contentFrame().locator('iframe\[data-visualize-content\]').contentFrame().locator('e2e-roots=').getByRole('button', { name: /^\[\\s\\p{Co}\]\*Saved\[\\s\\p{Co}\]+count:\[\\s\\p{Co}\]+5\[\\s\\p{Co}\]\*$/u }) : frameLocator("iframe\[data-visualize-guest\]:visible") &gt;&gt; frameLocator("iframe\[data-visualize-content\]") &gt;&gt; getByRole("button", name: "Saved count: 5")

Evidence: trace `.e2e/visualize-lifecycle-fixed/artifacts/web/e2e_visualize_lifecycle.e2e.ts__page_20capacity_20reclaims_20hidden_20guests_20and_20restores_20the_20oldest_20-95600d1c/default/attempt-0/trace/trace.zip` · Details: `.e2e/visualize-lifecycle-fixed/failures/e2e_visualize_lifecycle.e2e.ts-page_capacity_reclaims_hidden_guests_and_restores_the_oldest_saved_state-449bc681-1b1084fa.md`

<details>
<summary>All 3 tests in 2 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/visualize/bridge.e2e.ts** · 1 failed | 1m 23s |
| 🔴 | stale page operations fail, explicit retry replaces the guest and scope close releases pages | 1m 23s |
| 🔴 | **e2e/visualize/lifecycle.e2e.ts** · 1 failed, 1 passed | 1m 41s |
| 🟢 | offline host exposes recovery and reconnects when online | 32.5s |
| 🔴 | page capacity reclaims hidden guests and restores the oldest saved state | 1m 8s |
</details>

<sub>e2e 0.17.0 · 3m 56s · web</sub>
