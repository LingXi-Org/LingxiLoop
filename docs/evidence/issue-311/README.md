# #311 forum submission

The screenshot's zero selected references is a valid #146 submission gate, but the form did not explain that gate beside the disabled button. Submission history also shared the submitting flag, so a pending history request could lock the editor and reference picker. Conversation reads had no retry and the room list could accept a late response from a previous course.

The form now explains missing content/reference and uploading states, offers the existing course conversation action, and keeps history loading/errors separate from submission. Conversation reads can be refreshed/retried, cancel superseded requests, and time out after 30 seconds. Automatic history polling waits five seconds after the preceding read finishes, so a slow read can complete or reach its timeout; explicit refresh and unmount still cancel obsolete reads. The fixed homework-channel picker uses the same handling. Submission retries retain their content, uploaded files, references and idempotency key; success clears them only while the original form is mounted, so a late receipt cannot erase a reopened saved draft. Tenant/course authorization and canonical server-side conversation capture are unchanged.

Validation: Web lint/typecheck/build, 121 existing Web tests, E2E typecheck and 15 official browser scenarios passed. See `validation.json`, `browser-junit.xml`, and `browser-summary.md`. The manifest binds the tested temporary source to these repository files. The initial red run had five product regressions and one ambiguous test locator; that locator was corrected, and the submit retry assertion was aligned with the existing shared 503 message without removing its preservation/idempotency checks. The late-receipt negative waits for the new draft to be persisted before delivering the old receipt; it failed on an actually empty reopened editor before the mounted guard and passes after it.

Repeat with installed locked dependencies:

```sh
E2E_TELEMETRY_DISABLED=1 node node_modules/e2e/dist/cli/bin.js run --config e2e.forum-submission.config.ts
```

Screenshots, trace/failure artifacts and the JSON report are under `.e2e/forum-submission`. On this Windows host, an isolated source copy under `D:\Temp` avoids the unrelated inherited user PnP loader; no user configuration was changed.

This is synthetic HTTP around real production components, not an original private case replay or a real provider/database integration. No production deployment was performed by this PR preparation; #311 remains open until a qualified release and actual route checks are recorded.

The polling review regression used real clocks: both slow-response and timeout cases failed before the three-line scheduling fix. A 6.5-second response now completes without cancellation, and a hung polling read reaches its actual 30-second timeout with an enabled retry. No production timeout or reference requirement was reduced.
