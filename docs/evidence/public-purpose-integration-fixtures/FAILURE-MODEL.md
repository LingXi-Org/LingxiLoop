# Public-purpose integration fixture failure model

Base `b8f29ef32360ad7569174145b6a206c18be6b9ca`, formal runtime 3.6.0. Written before changing the three integration fixtures. This patch changes tests only.

CI run 39623951322 recorded **360 passed, 2 failed, 5 timed out, 14 skipped**. All five durable-public-activity cases wait for their initial public prefix to be labelled commentary. #275 instead keeps the current unresolved public prefix as an answer candidate until a tool or committed replacement establishes its purpose. That stale gate cannot release the synthetic driver, so each case times out after 20 seconds; subsequent control-plane teardown errors are retained as part of the original failure. The other two cases reach their final assertion and reject the new process-through-report_progress prompt contract.

Required boundaries:

- Observe the exact prefix over real Worker/control/PostgreSQL/SSE before any tool or driver completion; require answer purpose at that point, without implying it is a validated final answer.
- A completed tool preamble or rejected/replaced candidate moves to commentary with the same stable public identity. The accepted final answer appears exactly once; its source remains in authorized activity history.
- Cancellation/revocation retains only the already authorized partial answer, with incomplete terminal status. Neither the later blocked text nor private reasoning may enter SSE, replay or durable public deltas.
- Unsafe text must still fail the safety boundary and be replaced by a valid committed response. The safe earlier prefix remains as commentary/history, never as a duplicate final answer or a private-content leak.
- Both provider fixtures must assert process/status instructions route through chat.report_progress and substantive answers continue streaming. Keep existing before-tool, provider-still-gated, failed-tool, reconnect, private-reasoning and final-once assertions.
- Do not change timeouts to hide a blocked gate, delete privacy assertions, alter product code, or run concurrent destructive reset fixtures. Tests use only the parent-assigned dedicated synthetic PostgreSQL/Redis fixture, serially; no external provider or production requests.
