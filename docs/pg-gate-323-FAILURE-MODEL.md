# #323 PostgreSQL gate deadline boundary regression

This change adopts the generic gate and coordinator as repository tools and tests their deadline semantics without a production connection. The only CI change selects their owning synthetic checks; no runtime configuration, credentials, private binding inventories, production receipts or production data are included.

## Failure model before implementation

- A heartbeat begins below the 80-second monotonic limit, then its asynchronous identity query completes at or just after the limit. A valid, unchanged PostgreSQL backend/transaction identity is not an identity failure merely because the observation timestamp crossed the planned deadline. Finish as an explicit deadline rollback after proving the held locks and release; never emit another `held` receipt after expiry.
- Deadline recognition must not bypass identity validation. Empty/malformed rows, a changed PID/backend start/transaction start/database OID, and identity query errors remain failures even if the clock has expired.
- Deadline recognition must not bypass lock validation. The latest exact six SHARE relation locks, relation OIDs, advisory locks, current PID/database and granted flags still need verification. Query failure, missing/ungranted/wrong-mode locks, or relation identity drift remain failures.
- A signal is a distinct termination reason, never evidence of a successful deadline expiry. This boundary regression requires the signalled critical operation to fail closed, while still proving rollback/release.
- Rollback failure, a failed release query, or nonzero/malformed release evidence cannot prove release and cannot produce successful deadline completion. Closing the client alone does not replace the zero-lock release check.
- A synthetic clock fixture must not create a real database connection or wait 80 seconds. The fixture executes the real fixed Node-e source with `mock.module('pg')`; an inert temporary `pg` stub throws if mocking is bypassed. The exact artifact bytes are copied to the temporary fixture and dynamically imported only after mocks are registered, avoiding static ESM import hoisting. Mock monotonic time and `timers/promises` advance logical one-second ticks immediately. The final identity await advances from 79,000 ms to 80,005 ms deterministically.
- Negative identity/lock cases retain a valid pre-deadline database timestamp while the monotonic clock crosses expiry, so an early deadline shortcut would turn them into a false success and fail these regressions. No bodies, credentials or raw driver errors enter assertions or output; the only URL is a fixed synthetic loopback fixture URL, and all temporary files are removed.

The source fixture defines one synthetic already-approved metadata closure solely to reach gate mode. Assertions focus on deadline control flow, latest identity/lock proof, explicit termination reason and release evidence. No private production receipts are inputs.

## Coordinator failure classification

- A terminal failure is known only after two bounded reads match the submitted handle's ID, operation, stack, immutable start/end timestamps and Complete/success:false. Keep the cutover receipt failed with native-failed; never parse it into success or replay the operation.
- Unknown wait failure followed by a true, pending, mismatched or unavailable terminal must not be used to manufacture success. Untrusted external error strings or forged diagnostic codes must not enter public receipts.
- HTTP 401/403 remains operation-denied with its status and stops further reads. Completed monitor cancellation must not accidentally cancel the independent terminal confirmation reads.
- The former coordinator regression returned observation-unavailable/native-complete instead of the expected known-failure classification, and dropped HTTP status on the thrown error. Regression cases were written first and reproduced these failures before implementation.

## Pre-fix reproduction

The original unmodified helper (SHA256 0e34d699866e024d6335e6843f2f6a069b1ffd54fa946f7be9f7c950d754b156) produced five passing boundary groups and one failing valid-expiry group: status failed, stage heartbeat-identity, released true. This was a deterministic synthetic reproduction, not a new production run or proof of the exact historical failed assertion. The original production failure remains unchanged.
