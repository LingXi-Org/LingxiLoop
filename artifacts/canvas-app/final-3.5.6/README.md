# PR212 final combined browser acceptance on runtime 3.5.6

Product candidate: **`b249631cd95027c6fab6234191cd1ff131e03a90`**, the normal integration of independently reviewed Canvas fixes with the formally published runtime 3.5.6. This evidence-only addition changes no product implementation or existing tests. The exact source files are pinned by [source-sha256.json](source-sha256.json); installed versions, root/server lock provenance and tarball integrity are recorded in [environment.json](environment.json).

## Results

- **Single browser invocation: 15 pass, 0 fail, 0 error, 0 skipped, 0 retries**, 87.82 s total (86.401 s summed test time). [Log](browser.log), [JUnit](browser-junit.xml), [summary](browser-summary.md), [14 screenshots](screenshots/), and per-case interaction JSON under `interaction/`.
- **Independent actual HTTP/PG/Redis integration: 13 pass, 0 fail, 0 cancelled, 0 skipped**, 52.527 s. It includes the new comment frame/canvas ownership boundary and CAS/revocation tests plus the exact original 11 checks. [Validation](http-pg/validation.json), [log](http-pg/integration.log), [runtime/source provenance](http-pg/provenance.json), [archive verification](http-pg-summary.json). All 14 original evidence files and their SHA256SUMS are archived byte-for-byte in `http-pg/`; paths remain relative to that subdirectory. Verify with `cd http-pg && sha256sum -c SHA256SUMS`.
- **Lint, E2E typecheck and production build passed**; the build includes Web typecheck plus pinned Visualize verification/build. [Exit codes and timings](checks.json), [lint log](lint.log), [E2E typecheck log](e2e-typecheck.log), [build log](build.log). Existing lint/chunk/highlight warnings remain. **292 source hashes** and **118 historical artifact hashes** were unchanged through verification: [preservation check](preservation-check.json).
- Independent integration code review found no unresolved P1/P2 and verified both parent changes were preserved by the merge. [Safe summary](independent-code-review-summary.json); review of this final evidence commit and its exact CI remains pending.

The HTTP run uses actual routing, permission checks, PostgreSQL CAS and Redis. Authentication identity, model HTTP, WuKongIM and object storage are fixtures. Raw logs intentionally preserve expected fixture-shutdown outbox-acknowledgement/control-plane-stopped warnings; passing assertions do not turn those into production observations. The HTTP agent removed its isolated PG/Redis containers and network after recording evidence. Existing synthetic local fixture credentials in the reproduction scripts are test constants, with no production credentials or configuration copied.

## Scope and test preservation

One official tester-army/e2e invocation combines the original 6 document cases, 4 successful-operation draft races, 3 failure/cancellation draft races, and 2 feedback-scope cases. It runs real CanvasView, host/AppBridge and the opaque-origin SDK App against the existing deterministic HTTP fixture. The tests cover normal save/ACK, remote revision conflict, late ACK, lost response/readback, page identity, explicit reference send/cancel, request cancellation, undeclared capabilities, two draft-loss fixes, failed/cancelled operations, and feedback closure/ABA scope invalidation.

Four execution copies are in an ignored private directory. Their only edits redirect artifact output to this new directory; all assertions and interactions remain byte-identical after reversing those path substitutions. [test-copy-manifest.json](test-copy-manifest.json) records original/copy hashes and the reversible substitutions; [test-output-paths.diff](test-output-paths.diff) contains every changed line. Existing product/test files and historical receipts were not edited. The aggregate configuration [execution-config.txt](execution-config.txt) inherits the original document configuration: one worker, zero retries, 120-second test timeout and 15-second assertion timeout. The standalone feedback configuration's 60/10-second waits are normalized to the shared original document configuration for this combined invocation; no behavioral assertion is removed or weakened.

Node 22.23.3, Chromium 154.0.8037.57, official e2e 0.17.0 / @e2e-dev/web 0.12.0, App SDK 2.0.0. A fresh root-owned `npm ci` completed before testing; this task did not reinstall or alter dependencies. Chromium's `--no-sandbox` is local container startup only and does not change any product iframe sandbox or production security configuration.

## Reproduction

Restore the four execution copies by applying the recorded output-path substitutions to their pinned source files. Place execution-config.txt at `.codex-canvas-final-356.config.ts`, then run:

```sh
E2E_TELEMETRY_DISABLED=1 E2E_CANVAS_CDP_URL=http://127.0.0.1:9339 node_modules/.bin/e2e run --config .codex-canvas-final-356.config.ts
npm run lint
npm run test:e2e:typecheck
npm run build
```

The build script includes Web typechecking and verifies/builds the existing pinned Visualize runtime. The official browser fixture listens on 5291. All local processes started for this verification are stopped afterward.

## Limits

This browser run uses deterministic API responses and injected workspace identity, not a real gateway-login/multiplayer journey. It does not prove live provider behavior, production authorization, production latency or deployment health. Actual HTTP/PG validation is independently recorded above, with its injected-authentication/provider limits stated separately. No long soak, production fault injection, migration, credential change, or paused runtime 3.5.3 observation was performed. Exact integrated CI and actual production rollout/Komodo receipt remain the sole integrator's gates; this receipt does not claim either has completed.
