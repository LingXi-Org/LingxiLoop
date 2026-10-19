### 🔴 e2e: 6 failed, 7 passed

**🔴 stale page operations fail, explicit retry replaces the guest and scope close releases pages**  
`e2e/visualize/bridge.e2e.ts:44`

**LOCATOR_NOT_FOUND** at step 7 of 7: `expect.toHaveText frameLocator("iframe[data-visualize-guest]:visible") >> frameLocator("iframe[data-visualize-content]") >> locator("#bridge-save-status")`, after 46.6s

> no frame matches iframe\[data-visualize-guest\]:visible: frameLocator("iframe\[data-visualize-guest\]:visible") &gt;&gt; frameLocator("iframe\[data-visualize-content\]") &gt;&gt; locator("#bridge-save-status")

- Screen: `/e2e/visualize/index.html?implementation=product&theme=light&bridge=lifecycle`

Evidence: screenshot `.e2e/visualize-recheck/artifacts/web/e2e_visualize_bridge.e2e.ts__stale_20page_20operations_20fail_2C_20explicit_20retry_20replaces_20the_20guest_20-65d67f04/default/attempt-0/screenshots/001-failure.png`, trace `.e2e/visualize-recheck/artifacts/web/e2e_visualize_bridge.e2e.ts__stale_20page_20operations_20fail_2C_20explicit_20retry_20replaces_20the_20guest_20-65d67f04/default/attempt-0/trace/trace.zip`, log `.e2e/visualize-recheck/artifacts/web/e2e_visualize_bridge.e2e.ts__stale_20page_20operations_20fail_2C_20explicit_20retry_20replaces_20the_20guest_20-65d67f04/default/attempt-0/failure/screen.txt` · Details: `.e2e/visualize-recheck/failures/e2e_visualize_bridge.e2e.ts-stale_page_operations_fail__explicit_retry_replaces_the_guest_and_scope_close_relea-6481b21f-5dc8d9a8.md`

**🔴 copy-image button writes a real PNG through the host clipboard**  
`e2e/visualize/lifecycle.e2e.ts:54`

**EVALUATE_FAILED** at step 4 of 4: `browser.evaluate`, after 145ms

> Failed to execute 'read' on 'Clipboard': Read permission denied.

- Screen: `/e2e/visualize/index.html?implementation=product&theme=light`

Evidence: screenshot `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__copy-image_20button_20writes_20a_20real_20PNG_20through_20the_20host_20clipboar-237fa4da/default/attempt-0/screenshots/001-failure.png`, trace `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__copy-image_20button_20writes_20a_20real_20PNG_20through_20the_20host_20clipboar-237fa4da/default/attempt-0/trace/trace.zip`, log `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__copy-image_20button_20writes_20a_20real_20PNG_20through_20the_20host_20clipboar-237fa4da/default/attempt-0/failure/screen.txt` · Details: `.e2e/visualize-recheck/failures/e2e_visualize_lifecycle.e2e.ts-copy-image_button_writes_a_real_PNG_through_the_host_clipboard-ad822c5a-33f3c1b6.md`

**🔴 offline host exposes recovery and reconnects explicitly**  
`e2e/visualize/lifecycle.e2e.ts:74`

**LOCATOR_NOT_FOUND** at step 6 of 6: `locator.tap getByRole("button", name: "重试")`, after 30.1s

> locator matched no nodes within getByRole("button", name: "重试")

- Asked for: button "重试"
- Waited: 30.1s
- Screen: `/e2e/visualize/index.html?implementation=product&theme=light`

Evidence: screenshot `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__offline_20host_20exposes_20recovery_20and_20reconnects_20explicitly-5e4bda12/default/attempt-0/screenshots/002-failure.png`, screenshot `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__offline_20host_20exposes_20recovery_20and_20reconnects_20explicitly-5e4bda12/default/attempt-0/screenshots/001-product-offline.png`, trace `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__offline_20host_20exposes_20recovery_20and_20reconnects_20explicitly-5e4bda12/default/attempt-0/trace/trace.zip`, log `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__offline_20host_20exposes_20recovery_20and_20reconnects_20explicitly-5e4bda12/default/attempt-0/failure/screen.txt` · Details: `.e2e/visualize-recheck/failures/e2e_visualize_lifecycle.e2e.ts-offline_host_exposes_recovery_and_reconnects_explicitly-37d11963-2af88d1a.md`

**🔴 page capacity reclaims hidden guests and restores the oldest saved state**  
`e2e/visualize/lifecycle.e2e.ts:85`

**TEST_TIMEOUT** at step 112 of 112: `locator.tap getByRole("button", name: "Fixture next page")`, after 52.5s

> test timed out after 600000 ms in phase body

Evidence: trace `.e2e/visualize-recheck/artifacts/web/e2e_visualize_lifecycle.e2e.ts__page_20capacity_20reclaims_20hidden_20guests_20and_20restores_20the_20oldest_20-95600d1c/default/attempt-0/trace/trace.zip` · Details: `.e2e/visualize-recheck/failures/e2e_visualize_lifecycle.e2e.ts-page_capacity_reclaims_hidden_guests_and_restores_the_oldest_saved_state-449bc681-1b1084fa.md`

**🔴 product: complete card interaction (light)**  
`e2e/visualize/parity.e2e.ts:60`

**ACTION_FAILED** at step 35 of 35: `locator.tap frameLocator("iframe[data-visualize-guest]:visible") >> frameLocator("iframe[data-visualize-content]") >> getByRole("button", name: "Saved count: 5")`, after 36.6s

> tap did not become actionable in time: locator.click: Timeout 17427ms exceeded. Call log: - waiting for locator('iframe\[data-visualize-guest\]:visible').contentFrame().locator('iframe\[data-visualize-content\]').contentFrame().locator('e2e-roots=').getByRole('button', { name: /^\[\\s\\p{Co}\]\*Saved\[\\s\\p{Co}\]+count:\[\\s\\p{Co}\]+5\[\\s\\p{Co}\]\*$/u }) - locator resolved to &lt;button type="button" id="fixture-count"&gt;Saved count: 5&lt;/button&gt; - attempting click action - waiting for element to be visible, enabled and stable - element is visible, enabled and stable - scrolling into view if needed - done scrolling :…

Evidence: screenshot `.e2e/visualize-recheck/artifacts/web/e2e_visualize_parity.e2e.ts__product_3A_20complete_20card_20interaction_20_28light_29-f00f593a/default/attempt-0/screenshots/001-product-light-card.png`, trace `.e2e/visualize-recheck/artifacts/web/e2e_visualize_parity.e2e.ts__product_3A_20complete_20card_20interaction_20_28light_29-f00f593a/default/attempt-0/trace/trace.zip` · Details: `.e2e/visualize-recheck/failures/e2e_visualize_parity.e2e.ts-product__complete_card_interaction__light_-66491815-cc9afb26.md`

**🔴 product: complete card interaction (dark)**  
`e2e/visualize/parity.e2e.ts:30`

**ACTION_FAILED** at step 9 of 9: `locator.tap frameLocator("iframe[data-visualize-guest]:visible") >> frameLocator("iframe[data-visualize-content]") >> getByRole("button", name: "Show detail")`, after 33.4s

> tap did not become actionable in time: locator.click: Timeout 11791ms exceeded. Call log: - waiting for locator('iframe\[data-visualize-guest\]:visible').contentFrame().locator('iframe\[data-visualize-content\]').contentFrame().locator('e2e-roots=').getByRole('button', { name: /^\[\\s\\p{Co}\]\*Show\[\\s\\p{Co}\]+detail\[\\s\\p{Co}\]\*$/u }) - locator resolved to &lt;button type="button" id="fixture-expand-content"&gt;Show detail&lt;/button&gt; - attempting click action - waiting for element to be visible, enabled and stable - element is visible, enabled and stable - scrolling into view if needed - done scrolling : frameL…

Evidence: screenshot `.e2e/visualize-recheck/artifacts/web/e2e_visualize_parity.e2e.ts__product_3A_20complete_20card_20interaction_20_28dark_29-4115f4cc/default/attempt-0/screenshots/001-product-dark-card.png`, trace `.e2e/visualize-recheck/artifacts/web/e2e_visualize_parity.e2e.ts__product_3A_20complete_20card_20interaction_20_28dark_29-4115f4cc/default/attempt-0/trace/trace.zip` · Details: `.e2e/visualize-recheck/failures/e2e_visualize_parity.e2e.ts-product__complete_card_interaction__dark_-aa41c308-c3bea3b5.md`

<details>
<summary>All 13 tests in 3 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/visualize/bridge.e2e.ts** · 1 failed, 1 passed | 2m 27s |
| 🟢 | bridge rejects synthetic gestures and unsupported methods, accepts real user actions | 1m 17s |
| 🔴 | stale page operations fail, explicit retry replaces the guest and scope close releases pages | 1m 11s |
| 🔴 | **e2e/visualize/lifecycle.e2e.ts** · 3 failed, 3 passed | 14m 30s |
| 🟢 | variants retain local state, tabs load D3/calendar and mobile stays bounded | 1m 37s |
| 🟢 | session switching retains each state and host theme synchronizes in place | 42.4s |
| 🟢 | failed acquisition retries explicitly | 16.5s |
| 🔴 | copy-image button writes a real PNG through the host clipboard | 19.1s |
| 🔴 | offline host exposes recovery and reconnects explicitly | 38.3s |
| 🔴 | page capacity reclaims hidden guests and restores the oldest saved state | 10m 57s |
| 🔴 | **e2e/visualize/parity.e2e.ts** · 2 failed, 3 passed | 8m 23s |
| 🟢 | upstream: complete card interaction (light) | 1m 12s |
| 🟢 | upstream: complete card interaction (dark) | 1m 54s |
| 🔴 | product: complete card interaction (light) | 3m 3s |
| 🔴 | product: complete card interaction (dark) | 1m 47s |
| 🟢 | standalone render.py export runs offline and retains independent widget state | 28.0s |
</details>

<sub>e2e 0.17.0 · 26m 0s · web</sub>
