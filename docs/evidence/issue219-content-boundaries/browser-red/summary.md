### 🔴 e2e: 2 failed, 1 passed

**🔴 legacy criteria keep separate native paragraphs on edit and reopen: plain**  
`e2e/content-boundaries/browser.e2e.ts:20`

**ASSERTION_FAILED**

> expected \["Explain the first inference\\\\\\n Verify the second result reviewed"\] to have length 2, got 1

- Screen: `/e2e/content-boundaries/fixture.html`

Evidence: screenshot `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-410f71fc/default/attempt-0/screenshots/001-failure.png`, trace `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-410f71fc/default/attempt-0/trace/trace.zip`, log `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-410f71fc/default/attempt-0/failure/screen.txt` · Details: `.codex-tmp/content-boundary-red/failures/e2e_content-boundaries_browser.e2e.ts-legacy_criteria_keep_separate_native_paragraphs_on_edit_and_reopen__plain-3613dba3-95217d8c.md`

**🔴 legacy criteria keep separate native paragraphs on edit and reopen: multiline-literal**  
`e2e/content-boundaries/browser.e2e.ts:20`

**ASSERTION_FAILED**

> expected \["Explain \*\*literal\*\* criterion\\\\\\n and its second line\\\\\\n Verify the resultreviewed"\] to have length 2, got 1

- Screen: `/e2e/content-boundaries/fixture.html`

Evidence: screenshot `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-947ae34d/default/attempt-0/screenshots/001-failure.png`, trace `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-947ae34d/default/attempt-0/trace/trace.zip`, log `.codex-tmp/content-boundary-red/artifacts/native/e2e_content-boundaries_browser.e2e.ts__legacy_20criteria_20keep_20separate_20native_20paragraphs_20on_20edit_20-947ae34d/default/attempt-0/failure/screen.txt` · Details: `.codex-tmp/content-boundary-red/failures/e2e_content-boundaries_browser.e2e.ts-legacy_criteria_keep_separate_native_paragraphs_on_edit_and_reopen__multi-c9092409-650cfcd8.md`

<details>
<summary>All 3 tests in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/content-boundaries/browser.e2e.ts** · 2 failed, 1 passed | 18.7s |
| 🔴 | legacy criteria keep separate native paragraphs on edit and reopen: plain | 14.4s |
| 🔴 | legacy criteria keep separate native paragraphs on edit and reopen: multiline-literal | 2.7s |
| 🟢 | private legacy recovery remains available after editing current content | 1.5s |
</details>

<sub>e2e 0.17.0 · 19.3s · native</sub>
