### 🔴 e2e: 1 failed, 4 passed

**🔴 copy-image native write fulfills and supplies a real PNG**
`e2e/visualize/clipboard-write.e2e.ts:42`

**ASSERTION_FAILED**

> expected "native-rejected" to be "observed"

- Screen: `/e2e/visualize/index.html?implementation=product&theme=light`

Evidence: screenshot `artifacts/issue-213-217/presentation-final/artifacts/web/e2e_visualize_clipboard-write.e2e.ts__copy-image_20native_20write_20fulfills_20and_20supplies_20a_20real_20PNG-78a9de85/default/attempt-0/screenshots/001-failure.png`, trace `artifacts/issue-213-217/presentation-final/artifacts/web/e2e_visualize_clipboard-write.e2e.ts__copy-image_20native_20write_20fulfills_20and_20supplies_20a_20real_20PNG-78a9de85/default/attempt-0/trace/trace.zip`, log `artifacts/issue-213-217/presentation-final/artifacts/web/e2e_visualize_clipboard-write.e2e.ts__copy-image_20native_20write_20fulfills_20and_20supplies_20a_20real_20PNG-78a9de85/default/attempt-0/failure/screen.txt` · Details: `artifacts/issue-213-217/presentation-final/failures/e2e_visualize_clipboard-write.e2e.ts-copy-image_native_write_fulfills_and_supplies_a_real_PNG-ad56e509-ec70c30e.md`

<details>
<summary>All 5 tests in 3 files</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/visualize/clipboard-write.e2e.ts** · 1 failed | 3.2s |
| 🔴 | copy-image native write fulfills and supplies a real PNG | 3.2s |
| 🟢 | **e2e/visualize/bridge.e2e.ts** · 2 passed | 19.3s |
| 🟢 | bridge rejects synthetic gestures and unsupported methods, accepts real user actions | 9.5s |
| 🟢 | stale page operations fail, explicit retry replaces the guest and scope close releases pages | 9.8s |
| 🟢 | **e2e/visualize/presentation-213-217.e2e.ts** · 2 passed | 9.2s |
| 🟢 | rounded visualization and top toolbar (1440) | 4.7s |
| 🟢 | rounded visualization and top toolbar (390) | 4.5s |
</details>

<sub>e2e 0.17.0 · 36.7s · web</sub>
