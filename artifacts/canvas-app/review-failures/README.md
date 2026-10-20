# PR212 failed and cancelled document operations

Independent review of combined candidate `0ec4d73161f367c8443494b15e1fc1b8aabcfad1` found another P2 in the guest inherited from fix `0767aaaf70053798807319e0f7c89d4c909c6c4d`: after a stale save failed, the authorized readback was delayed. Undoing to the original text during that readback left text equality reporting a clean draft. Returning to chat then unmounted the editor without confirmation. The remote revision 2 was not overwritten, but the user's live draft/leave protection was lost.

The independent red test executed the full scenario and failed its leave-confirmation assertion (21.44 s). Its [JSON](red/conflict-undo.json), [log](red/conflict-undo.log), [JUnit](red/conflict-undo-junit.xml) and [reproducer](red/reproducer.e2e.ts) are preserved unchanged. `canvasCount=0`, `confirmationCount=0`, one stale PATCH, zero feedback. [Failure model](failure-model.md) preceded this follow-up implementation.

## Validation result

All **13 unique browser cases** completed successfully on the final product source across two runs. The first run was **12 pass / 1 fixture failure**: [log](green/browser.log), [JUnit](green/browser-junit.xml). Cancellation's test probe used an `output` element (implicit `status`), making a later status locator match both it and the real editor status. Changing only that test-only result tag to `pre` resolved the ambiguity; the focused cancellation rerun was **1/1 pass, 5.31 s**: [log](green/cancel-followup.log), [JUnit](green/cancel-followup-junit.xml). This is not a single clean 13/13 run. The product source did not change between these runs.

The independent save-conflict red case now passes, as do new HTTP-failure/cancellation cases and the previous 10. After leave-confirmation cancellation, the retained draft's next PATCH still uses revision 1; remote content remains revision 2 and feedback counts remain zero. [Save conflict](green/save-conflict-undo.json), [HTTP failure](green/http-failure.json), [SDK cancellation](green/sdk-cancellation.json). Lint, Web typecheck and E2E typecheck passed; original lint warnings remain. [Source hashes](source-sha256.json), [validation receipt](validation.json), and SHA256SUMS tie the final files to these results.

## Correction and boundaries

Input generation changes now count as dirty immediately while a document request is pending. Both save and reload rejection paths retain that state after failure or cancellation, without adopting a remote revision. A cancelled-tool notification also preserves/report this state. Later failures cannot clear an already retained draft. Successful acknowledged saves and explicit successful reloads with no new input keep their established clearing behavior.

Three new official-engine cases cover stale-save/readback failure, reload HTTP 503, and actual SDK request cancellation. All undo to the old text, verify a leave confirmation that can be cancelled, retain the draft, and verify a later save still uses revision 1 while remote revision 2 remains unchanged. The cancellation case clicks the actual editor reload/confirmation flow; a test-only `failure-probe.js` supplies an AbortController to that real `App.callServerTool` request. It is distinct from the older probe's independent tools/call cancellation. Fixture failures and probes never enter the production bundle; no production fault injection, provider calls or credential changes occur.

The original six browser cases and four prior successful-save/reload race cases are rerun with outputs redirected to this evidence directory, preserving all earlier receipts. Node 22.23.3, Chromium 154.0.8037.57, official e2e 0.17.0 / web engine 0.12.0, runtime 3.5.5. These are actual product components and SDK with a deterministic HTTP fixture, not real-login/provider or production evidence. Lint and Web/E2E typechecks are the affected owning checks; no unrelated server suite was repeated.

Reproduce new failure cases with the existing official configuration:

```sh
E2E_TELEMETRY_DISABLED=1 E2E_CANVAS_CDP_URL=http://127.0.0.1:9337 node_modules/.bin/e2e run --config e2e.canvas-app-races.config.ts --grep 'readback retains|reload http-failure|reload sdk-cancellation'
```

Exact integrated CI, independent append-commit review, and production verification remain the sole integrator's work. This patch changes no feedback security code, persistence schema, host permission checks, model HTML privileges or streaming protocol. Original logs retain their native whitespace.
