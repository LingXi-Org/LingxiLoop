# Web CI observed-progress fixture failure

Base: `dcd71bd269bcc9281e95bc85fa9263766456ad8f`.

The merged Web CI (run `39537559334`, job `119017669848`) passed lint but failed two `run-updates.test.ts` assertions at original lines 179 and 327: the tests expected no message parts after a new request version, whereas `observedProgress` now deliberately projects a factual queued/leased status as commentary.

The fixture correction must preserve these failure checks:

- A failed prior request's streamed answer and error must not become the new request's body.
- A completed prior request's answer, citation claims/evidence, and answer activity identity must disappear on the new request version.
- The only new visible part before eligible body text is the exact status commentary with requestVersion/fence `2:2`; this must not be asserted as model output.
- A queued preview must not expose an answer or citations. Verify its actual public projection without loosening the assertion to arbitrary content.

Run the unmodified owning file before changing assertions, then rerun that same file and lint only the changed file. Do not change production projection behavior, dependency locks, cancellation handling, or the repository-wide test runner. No browser, database, provider, production, or new dependency installation is needed.
