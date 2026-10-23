# Invocation purpose propagation

Failure cases before implementation:

- API categories (agent-turn/structured) alone obscure generation, correction and
  content-review operations. Derive the operation only at the trusted invocation.
- Arbitrary prompt, answer, model or tool strings must never become purpose labels.
  Accept only the closed enum; leave legacy unknown operations unspecified.
- Preserve one trace span per real call, all timings, cost, usage, attempts and
  terminal states. Labelling cannot hide calls or mark unfinished work complete.
- Persist only the safe enum in existing usage extras. No schema migration or
  raw prompts, reasoning, arguments, credentials or private trace are needed.
- Native trace and usage fallback must agree on labels; older runtime records
  and clients without the optional field retain generic model-call labels.
- The final product v1 TraceSpan schema is strict in existing browser clients.
  Keep operation in internal/native metadata and map it to the existing name;
  never add an unnegotiated public key that makes the entire waterfall unreadable.
- Tenant/project/principal authorization in scoped usage reads stays unchanged.

The performance mechanism and provider protocol changes belong to the upstream
runtime. This product change consumes safe metadata and does not alter execution,
memory persistence, budgets, cancellation, retries, public text or UI finish.
