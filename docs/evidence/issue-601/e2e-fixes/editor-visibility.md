# Slides editor visibility follow-up

Production baseline: `dade873ac04492b00c23a29a26c95fa3da5666fb`, product61 / published SDK3.8.20 / native14.

Lenovo acceptance reported intermittent long opening overlays for a new deck and an existing deck, including a same-deck reopen over 60 seconds. The browser's exact stalled request and production root cause are not yet known.

A cloud Chromium regression uses the actual React ArtifactEditorFrame with an opaque sandbox, fixture grant and valid child context, and an image response deliberately left unfinished. With the original component, a valid context reaches the parent (`received=1`) while the load event remains absent; the loading overlay persists and the regression fails. With the fix, the same authenticated-by-source/nonce/schema child context reveals the mounted editor before the load event. This proves a loading lifecycle defect, not that the Lenovo resource failure has been fully diagnosed.

Slides now waits for validated editor context rather than treating document load as application readiness. A missing handshake has a 30-second recovery timeout and a retry button; retry obtains a new grant. The browser check accelerates only that timer to 100ms for the timeout branch. It does not reload or modify saved documents. Design keeps its previous load behavior. The sandbox and message validation are unchanged.

Run `node scripts/check-slides-editor-visibility.mjs`. Checks cover wrong-window/nonce/schema rejection, valid context before load, opaque sandbox, missing-handshake recovery, and a new grant on retry. Backend grants are mocked. No production or Lenovo browser is driven; no model calls or performance benchmark rounds run.

The independent execution-terminal report remains under investigation: saving a file does not establish completion of the model turn. Its production runId and sanitized failed-operation/runtime diagnostics are required before selecting a fix. This PR must not be described as correcting that second defect or establishing production E2E acceptance.

No schema, runtime/SDK, security-setting or video capability change. No merge or deployment from this follow-up branch; release coordination belongs to the parent task.
