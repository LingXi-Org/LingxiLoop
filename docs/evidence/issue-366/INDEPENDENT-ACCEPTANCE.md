# #366 independent recovery and browser checks

## Scope and exact identities

These are development checks, not formal-package, real-provider or production
qualification. No real model or production endpoint was called for them.

- Browser consumer at execution start:
  `08cf0c6304796f83f3512368f9750374ea557999`.
- Native-event projection producer:
  `bc05f8856542d121d4350e37b7aa0d7ee033fe3e`, explicitly marked
  `native-event-projection-fixture` / `development-source`.
- Producer UI source SHA-256:
  `544fc73d7ab30e6a1725665d3f551ac1eec0b19c26d89c6982989dff2812eb47`.
- Input `artifacts/react-delivery-366/snapshots.json` SHA-256:
  `fc6d0ed7b1610a4b8ec57d89ac6597509b8d74e7527b523c9d82a91be2d6dad7`.

The product producer passes synthetic native events through real
`RunStreamProjection` and `assistantRunResponse`. It does not execute a provider,
tool, authorization policy or durable result transaction. The browser uses the
normal stream decoder, state reconciliation and message components. Independent
OS tests cover the execution/transaction boundaries separately.

## Official browser result

Run `01a169b8-ddb1-72b2-960c-869813e69388`: **2/2 PASS**, zero retries,
32.49 seconds including startup. Both 1280px and 390px execute all six scenarios:

- A survives projected tool/commentary states; B appends without final replay.
- Failed replacement retains A and its failure status.
- Successful replacement switches atomically to the new answer.
- Cancellation retains A and the cancelled state.
- Reconnection plus stale/duplicate stream data converges to the same answer.
- Equal text from different runs remains two messages.

Each viewport checks 32 streamed snapshots and independently loaded fixture
history. All scenarios observed zero mutation requests. There are 24 screenshots.
Desktop append and narrow cancelled-state screenshots were also visually read;
both show the ordinary answer outside collapsed process content. The cancelled
case retains the cancellation label.

Artifacts are under the integration worktree `.e2e/react-delivery/`:

| File | SHA-256 |
| --- | --- |
| `report.json` | `6991ce5d61bd18ce4b7f33e57c636e8967269987cb3239bdfb865760d7e8b7b3` |
| `observations-1280.json` | `ee23c7c98d3036a959a1cc30096f6d551f71c5874fd2269db5a2bd753d3e9c04` |
| `observations-390.json` | `5045854ecd56d2a7a8c124a32a0efa2d0997311ecce80eb4bb2d3c84bd0f567d` |

`qualification.json` separates producer and consumer identity. Its
`browserReplayToObservationMs` measurements are synthetic DOM observations,
not provider TTFT, actual paint timing or production latency.

## Retained failures and fixes

1. Run `01a169b2-dd1a-7745-9c73-12d42aca5819`, consumer `bc05f885`:
   2/2 failed because `VisualizeText` returned a new object from its store
   selector. React reported an uncached snapshot and maximum update depth;
   message error boundaries replaced the answers. Product fix `8403d1c9`
   selects a primitive part index and memoizes derived display data. Original
   assertions were retained.
2. Run `01a169b6-510c-74d2-a1ca-8b57f0a3eb97`, consumer `8403d1c9`:
   initial append and replacement scenarios passed, then repeated Vite page
   navigations caused Chromium `ERR_INSUFFICIENT_RESOURCES`. Fixture fix
   `08cf0c63` loads once per viewport and resets all streams, state, history and
   counters between scenarios. All six scenarios and assertions remain.

Both failed runs, screenshots, traces and reports remain under
`.e2e/react-delivery-runs/`; the final passing run does not overwrite them.

## OS recovery result

`dist/test/react-segments-recovery.test.js`: **7/7 PASS**, zero skips,
23.36 seconds, against the OS owner's first successful compiled development
tree. No independent build was started. The test source includes the optional
`executionSteps` field correction. This is not a claim for a later frozen SHA.

The suite validates seal/recovery-record atomicity, rollback, duplicate ACK,
fresh publication authorization, reserved-step forgery rejection, 27 sealed
revisions across the 100-event page boundary, valid old-fence recovery with
old-fence write rejection, cancellation at four publication boundaries, and
UTF-16 source ranges with structural tampering. The database is isolated PGlite;
this result must not be described as an external PostgreSQL deployment check.

Log `/tmp/issue366-recovery-first.log` SHA-256:
`be3bff45b46baee366a60c30e2e9e7f2a312b11c26639a70e0c6293859c779fb`.

Remaining gates: the OS owner's full runtime/tool/side-effect checks, final
frozen CI, formally published dependency qualification, and specifically
authorized real-provider/product validation. Earlier arithmetic success and
visualization protocol failures remain separate evidence.
