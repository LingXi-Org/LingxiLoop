# Final focused browser checks

Official result: 1 passed, 2 failed. No automatic retry or further browser run.

- PASS (101.01s): revoked author document unloads; active page count reaches zero; explicit retry/save works; replaced-page operations reject; current real follow-up succeeds; closing scope removes all pages. See bridge/lifecycle.json.
- FAIL (59.11s): the observer called the original native clipboard.write once and returned its exact promise. The browser rejected it with Write permission denied. No PNG write or OS clipboard readback was established. The separately preserved custom-provider startup also failed with No usable sandbox, without disabling the sandbox.
- NOT VERIFIED / FAIL (323.19s): page index 41 did not become ready within its 25-second readiness deadline. Earlier indices 0..40 reached ready. The trace records 42 successful page creates, then loading and an error UI; no HTTP error or console warning/error. The exact phase-error cause is not retained. See capacity-diagnostic.json and the original official capacity-trace.zip. The browser never tested 64→65 admission or post-eviction restoration. Backend boundary tests do not replace this missing browser gate.

The runner exited and the fixture/browser slot was released. Source hashes correspond to the same frozen implementation as the final independent screenshots.
