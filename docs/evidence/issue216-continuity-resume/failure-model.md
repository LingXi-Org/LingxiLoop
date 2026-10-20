# Resumed continuity investigation — before fixture changes

The prior product run failed with an unowned Abort after 207 seconds. Its native
proposal and repair calls succeeded; the following validation failed twice.
The retained source had already rejected an earlier page. One later native retry
accepted the tail but correctly preserved rejection. None of this establishes
complete product continuity or the original timeout's owner.

Preserve the original database and prior tests. A fresh dedicated qualification
test DB must exercise the same product flow, existing real provider, bounded
review/repair, model ledger and unchanged test deadlines. Persist content-free
phase and public operation timing even on failure. Observe only database wait
categories/blocker counts, never SQL parameters, SQL text, provider output,
review feedback, memory bodies, prompts or credentials. Compare source cursors,
validation reason codes and review booleans through the protected synthetic DB.

Possible failures to distinguish: foreground provider/tool failure; scope
resolver authorization timeout; pool/lock contention during active scheduling;
invalid generated proposal; review rejection or missing coverage; aborted or
uncommitted apply; retry backoff; version/epoch/lease invalidation. Do not solve
any of these by weakening review, resetting progress or expanding budgets.
