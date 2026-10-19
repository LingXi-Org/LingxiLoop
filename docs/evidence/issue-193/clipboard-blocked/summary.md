### 🔴 e2e: 1 failed

**🔴 copy-image button writes a real PNG through the host clipboard**  
`e2e/visualize/lifecycle.e2e.ts:50`

**ENGINE_FAILURE** (launch)

> browser provider "issue193-local-clipboard" could not lease a browser: Local clipboard browser exited null: w/31a6424c-a7e9-4a6a-819b-0075f01cfc12.dmp: Read-only file system (30) \[1019/131539.731775:ERROR:third_party/crashpad/crashpad/handler/linux/crash_report_exception_handler.cc:209\] PrepareNewCrashReport failed Received signal 6 `#0` 0x55bdbf066bc3 (/workspace/.lingxi-setup/cache/ms-playwright/chromium-1243/chrome-linux64/chrome+0x6a9abc2) `#1` 0x55bdc3d2c494 (/workspace/.lingxi-setup/cache/ms-playwright/chromium-1243/chrome-linux64/chrome+0xb760493) `#2` 0x7f4f48722d70 (/usr/lib/x86_64-linux-g…

Details: `.e2e/visualize-clipboard/failures/e2e_visualize_lifecycle.e2e.ts-copy-image_button_writes_a_real_PNG_through_the_host_clipboard-ad822c5a-33f3c1b6.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/visualize/lifecycle.e2e.ts** · 1 failed | 5.2s |
| 🔴 | copy-image button writes a real PNG through the host clipboard | 5.2s |
</details>

<sub>e2e 0.17.0 · 56.4s · web</sub>
