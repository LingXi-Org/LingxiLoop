# #326 synthetic recovery failure inventory

Written before the new isolated integration fixture. Exercise the product configuration for `deepseek-ai/DeepSeek-V4.1-Flash` using a loopback HTTP provider, the formal installed runtime, real disposable PostgreSQL/Redis, and the recording WuKong client. No production model endpoint or user conversation is accessed.

Failure cases:

- A transient HTTP 503 becomes an unrecoverable turn instead of retrying only the failed model call.
- Repeated HTTP 503 exceeds the product's three-attempt limit; HTTP 402 quota rejection retries despite being permanent.
- Attempt settlements omit, duplicate, or misclassify the issued calls, or retain the synthetic private provider body/API key.
- Replaying the same accepted message creates a second run or another outbound model call.
- A genuinely new message with identical text is collapsed into the previous failed/successful run, or inherits its terminal state.
- Replaying the same terminal feedback dispatches an additional system message or enqueues work.
- Failed run state, its terminal identity and its projected terminal metadata disagree after replay.

This fixture does not claim production recovery or confirmation of the original incident. Existing `runtime-reliability.test.ts` owns project-revocation and cancellation boundaries; `runtime-provider-timeout.test.ts` / `runtime-deadline-recovery.test.ts` own timeout classification; `runtime-auxiliary-latency.test.ts` owns retry after a completed tool and receipt uniqueness. Run those owning checks with this fixture. Tool recovery never gains a persistent permission or re-executes a tool from this fixture.
