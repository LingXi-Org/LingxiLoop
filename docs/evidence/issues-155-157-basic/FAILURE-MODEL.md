# Short acceptance failure inventory

Recorded before changing the acceptance harness. Scope: published 3.5.5 with
real isolated PostgreSQL/Redis and synthetic provider responses.

- Normal integration overwrites historical checked-in evidence.
- Auxiliary receipt writers ignore the launcher's exclusive output directory, or
  overwrite an existing receipt. Check their actual filesystem calls with an
  explicit output directory and with the ignored default, without opening a DB.
- Public read-only status evidence includes unnecessary administrative inventory
  or current container identifiers instead of aggregate health and provenance.
- A failed launch/test leaks its temporary database or interferes with another task.
- Primary rejection retries indefinitely; fallback bypasses authorization, prices
  or shared attempts; unavailable fallback fabricates success.
- Cancellation leaves transport/capacity occupied; embedding failure blocks
  ordinary conversation or mixes vector spaces.
- Concurrent child starts exceed root budgets, consume closing capacity, reset
  the root, or create work despite token/cost/deadline denial.
- Fanout is unbounded; denial notices duplicate or wake agents; completed results
  disappear; subsequent human messages cannot run.

Retain original failures separately. Synthetic usage/tariff arithmetic is not a
provider billing receipt. No production fault injection, fixed 3.5.3 soak operation,
merge, deployment or issue closure belongs to this branch.
