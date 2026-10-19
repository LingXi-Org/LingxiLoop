# Product provider-fault boundary acceptance

Written before the integration harness. Baseline 97441ba3 / published 3.5.2. All provider responses are synthetic loopback HTTP. New dedicated local PostgreSQL database and Redis index12; no live key, production traffic, user-message replay or paid request.

Missing product-boundary checks to add: transient429/503/socket reset must share the existing runtime retry limit and settle each attempt once in the product ledger; truncated SSE must not become a successful durable answer; repeated empty output must terminate rather than spin; every terminal failure must have one replayable notice without Agent wake; the next independent human message must succeed without residual leased/queued work. Failed provider responses must not leak raw private bodies into the ledger.

Do not claim this covers approved alternate-provider routing, embedding vector-space changes, actual supplier invoices, real-provider faults, native-tool write/crash recovery, or browser delivery. Those require separate evidence. No product implementation is changed by this harness.
