# PR212 draft preservation review and fix

Independent review froze PR212 at `ebe818fe9f702199382aa998995da24b55e4b356`. Its 14 source hashes matched the original manifest and exact-head CI 39349990305 was green. The original six browser tests did not exercise two new failure paths. No production or author branch was changed by these local reproductions.

## Confirmed failures before the fix

- **Save followed by undo:** submit text A, restore the former saved text O while the response is delayed 1200 ms. The host's own revision-2 notification treated O as clean relative to the old baseline and replaced it with A. Browser assertion observed A instead of O, with status `已保存 · 第 2 版`. [JSON](red/save-undo.json), [official engine failure](red/save-undo.log). One PATCH, zero feedback/Agent invocations.
- **Edit after reload confirmation:** confirm discarding a dirty draft, then type new text during the delayed authorized read. Its response unconditionally replaced that new text with the remote document. [JSON](red/reload-edit.json), [official engine failure](red/reload-edit.log). Zero PATCH and zero feedback/Agent invocations.

Both use the actual CanvasView, opaque iframe, official App/AppBridge, and tester-army/e2e `@e2e-dev/web`. HTTP and concurrency delays are synthetic fixture controls. They are not production incidents or real login/provider evidence. The initial reviewer configuration error collected no tests; it is not counted as a product failure. [Failure model](failure-model.md) preceded the reproductions and fixes.

## Change

The guest tracks input generation and separates pending document operations from text equality. Incoming notifications cannot replace a draft while save/read is pending. A successful save advances the acknowledged baseline, retaining subsequent input, including undo to the former baseline. A confirmed read replaces input only if its generation has not changed; otherwise the text and original CAS baseline remain. Retained input remains logically dirty even if it equals the old document, so later notifications and leave handling cannot discard it. A second explicit reload can adopt the current saved document. Editing remains available during requests; no automatic retry or new persistent store is introduced.

Only the fixed guest changes in production. Test fixture delay controls also support the independent reference-scope review; they never enter the production bundle. Host authorization, iframe permissions, old HTML, Gen UI/Tweak and streaming code are unchanged by this commit.

## Validation

Final-source coverage completed all **10 unique browser cases** (original 6 + new 4), with one initial readiness assertion failure and one focused rerun: the first [browser run](green/browser.log) / [JUnit](green/browser-junit.xml) had **9 pass, 1 fail**. That failure occurred before the last case's scenario while the review-only readiness timeout was 5 s; the captured screen subsequently showed an initialized revision-1 editor. The test was rerun alone with the repository's existing 15 s assertion timeout, with no product/test-source change, and **1/1 passed**: [follow-up log](green/followup.log), [JUnit](green/followup-junit.xml). This is not described as a single clean 10/10 run. Interaction JSON and source hashes are retained alongside both receipts. The earlier 9-pass development run is retained in [intermediate](intermediate/9-pass.log); final coverage adds reload followed by undo to the old baseline. Root historical six-test artifacts and source manifest remain unchanged and describe the original candidate, not the fix.

The final run combines the unchanged original six cases (a temporary copy changes only artifact output paths) with four new draft-race cases: save/undo, multiple subsequent edits, reload/new input, reload/undo. It preserves normal ACK, remote CAS conflict, late ACK, preview page identity, explicit reference send/cancel, unsupported capabilities and request cancellation coverage. New save cases also verify the following save uses acknowledged revision 2; reload races verify the next stale save still uses revision 1 and cannot overwrite remote revision 2.

Reproduce the four new cases with a local Chromium CDP endpoint:

```sh
E2E_TELEMETRY_DISABLED=1 E2E_CANVAS_CDP_URL=http://127.0.0.1:9337 node_modules/.bin/e2e run --config e2e.canvas-app-races.config.ts
```

The original six use `e2e.canvas-app.config.ts`; direct runs overwrite their historical artifact filenames, so use an isolated worktree/output copy when preserving receipts. Final local environment: Node 22.23.3, runtime 3.5.5, official e2e 0.17.0 / web engine 0.12.0; Chromium 154.0.8037.57. Existing owning lint warnings are unchanged. This focused guest fix does not rerun the unrelated server suite. Exact integrated CI, independent fix review, runtime upgrade integration, production rollout and real-user journeys remain the sole integrator's gates.
