### 🔴 e2e: 1 failed

**🔴 copy-image button writes a real PNG through the host clipboard**  
`e2e/visualize/lifecycle.e2e.ts:50`

**ENGINE_FAILURE** (launch)

> browser provider "issue193-local-clipboard" could not lease a browser: Local clipboard browser exited null: No such file or directory (2) \[1019/132439.075876:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:145\] open /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq: No such file or directory (2) Received signal 6 `#0` 0x5632825ebbc3 (/workspace/.lingxi-setup/cache/ms-playwright/chromium-1243/chrome-linux64/chrome+0x6a9abc2) `#1` 0x5632872b1494 (/workspace/.lingxi-setup/cache/ms-playwright/chromium-1243/chrome-linux64/chrome+0xb760493) `#2` 0x7f2f233c9d70 (/usr/lib/x86_64-linux-gn…

Details: `.e2e/visualize-clipboard-env/failures/e2e_visualize_lifecycle.e2e.ts-copy-image_button_writes_a_real_PNG_through_the_host_clipboard-ad822c5a-33f3c1b6.md`

<details>
<summary>All 1 test in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/visualize/lifecycle.e2e.ts** · 1 failed | 1.4s |
| 🔴 | copy-image button writes a real PNG through the host clipboard | 1.4s |
</details>

<sub>e2e 0.17.0 · 31.7s · web</sub>
