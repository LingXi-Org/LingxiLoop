### 🔴 e2e: 1 failed, 3 passed

**🔴 Public activity presentation › official reference components**
`e2e/web/activity-presentation.e2e.ts:62`

**ENGINE_FAILURE** at step 2 of 2: `app.open https://www.assistant-ui.com/elements/memory-chips`, after 777ms

> navigation failed: page.goto: net::ERR_CERT_AUTHORITY_INVALID at `https://www.assistant-ui.com/elements/memory-chips` Call log: - navigating to `"https://www.assistant-ui.com/elements/memory-chips",` waiting until "load"

- Screen: `chrome-error://chromewebdata/`

Evidence: screenshot `.e2e/215-218-presentation/artifacts/web/e2e_web_activity-presentation.e2e.ts__Public_20activity_20presentation__official_20reference_20components-4e1eed25/default/attempt-0/screenshots/001-failure.png`, trace `.e2e/215-218-presentation/artifacts/web/e2e_web_activity-presentation.e2e.ts__Public_20activity_20presentation__official_20reference_20components-4e1eed25/default/attempt-0/trace/trace.zip`, log `.e2e/215-218-presentation/artifacts/web/e2e_web_activity-presentation.e2e.ts__Public_20activity_20presentation__official_20reference_20components-4e1eed25/default/attempt-0/failure/screen.txt` · Details: `.e2e/215-218-presentation/failures/e2e_web_activity-presentation.e2e.ts-Public_activity_presentation-official_reference_components-aabc6186-c1cfa19c.md`

<details>
<summary>All 4 tests in 1 file</summary>

|  | Test | Time |
| --- | --- | --- |
| 🔴 | **e2e/web/activity-presentation.e2e.ts** · 1 failed, 3 passed | 25.2s |
| 🟢 | Public activity presentation › client public-receipt render budget | 7.3s |
| 🟢 | Public activity presentation › known aliases, persisted generic titles and distinct official cards 390 | 7.8s |
| 🟢 | Public activity presentation › known aliases, persisted generic titles and distinct official cards 1440 | 8.5s |
| 🔴 | Public activity presentation › official reference components | 1.6s |
</details>

<sub>e2e 0.17.0 · 26.2s · web</sub>
