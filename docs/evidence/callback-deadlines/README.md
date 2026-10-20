# Product callback deadline evidence

Related to #153 and #161. This evidence concerns the product callbacks used by
usage, terminal and result outboxes. The [failure model](../../callback-deadlines-failure-model.md)
was committed before implementation. The parent integrator owns exact-release
CI, publication and production acceptance.

## Product stage: formal runtime 3.5.5

Source: `f26210a0206e88ceda63aac7a85f62192c1aa492`. Its parent failure-model
commit is `1e22cc95`. Tests use Node 22.23.3, PostgreSQL 16.15 on localhost and
synthetic messaging. No production/provider credentials or memory content are
part of this evidence. See [validation.json](product-stage-3.5.5/validation.json)
and verify the retained files with `sha256sum -c SHA256SUMS` from this directory.

| Check | Result |
| --- | --- |
| Original callback behavior, unchanged except observer export for fixture access | Eight SQL lock waiters; expected shared maximum two; red |
| Initial candidate using only client destruction | 4/6 passed; two real PostgreSQL backends continued waiting; red |
| Final product session scope | 9/9 passed |
| Product callbacks, authorization and IM receipt recovery | 4/4 passed |
| Existing service tests | 106/106 passed |
| Existing terminal/cancel/revocation/next-message integration | 3/3 passed |
| Server typecheck and lint | Passed |
| Independent review of implemented product scope | No remaining P1/P2 |
| Product → runtime terminal/result cancellation on 3.5.5 | 0/2 passed; expected red until new public API is wired |

The [scope artifact](product-stage-3.5.5/scope.json) records eight submitted / two
entered callbacks, zero surviving lock waiters, and a successful foreground
query and next callback before the blocker was released. Early-abort backend
cleanup plus the next callback took about 93 ms. A 150 ms deadline-only fixture
finished backend cleanup in about 153 ms. These are local short-run observations.

The IM fixture covers both cancellation before sending and cancellation after
the synthetic messaging server accepted the send but its receipt UPDATE was
blocked. The second case retains the autocommitted dispatch marker and uses the
same nonce to reconcile history on retry; it sends exactly once. Authorization
is checked through the same scoped database, including deep project membership.

## Reproduction

Use an isolated local PostgreSQL database whose name contains `_test` and a
separate synthetic Redis namespace. `INTEGRATION_DATABASE_URL` and `DATABASE_URL`
must identify that same dedicated database. Migrate an empty database using
`npm run db:migrate` before product integration. The test runner intentionally
resets product fixture tables; never point it at development or production data.

```sh
npm run server:typecheck
npm run server:lint
npm run server:test
npm run test:integration -- --file callback-deadlines.test.ts \
  --file callback-delivery-deadlines.test.ts --file runtime-reliability.test.ts
```

`callback-deadlines.test.ts` also runs directly with `node --import tsx --test`;
it creates only its own synthetic receipt table. It writes the repeatable
`artifacts/callback-deadlines/scope.json` artifact. The migration and production
schema are unchanged by this PR.

## Final public runtime integration

Pending a formal runtime release and explicit operation-context wiring. The two
real PostgreSQL red fixtures are retained in `runtime-linked-red.log`; both
cancel after a runtime read actually reaches its lock wait and leave the blocker
held through the assertion. The final candidate must demonstrate rejected
callbacks, vanished runtime backends, a foreground query and same-nonce recovery
before this boundary is accepted. Earlier green product-only tests cannot serve
as evidence for that final candidate.

Full production fault matrices, live providers and long soak remain unverified
by these short fixtures. No production action was performed for this work.
