# #262: one foreground answer through repair

The native public-text ledger already rejects replayed seq/chunk identities, but
product projection displayed every unaccepted candidate in the foreground. A
repaired response therefore accumulated earlier full answers. Native `model.delta`
also emits the final candidate after the public segment ends, producing a second
preview before committed-source association arrives.

The foreground now archives superseded/no-tool candidates when a later attempt or
committed result replaces them. Tool-bearing public preambles remain, including
interrupted ones. Exact acceptedResultId association remains the only acceptance
proof. All archived text remains in authorized activity pagination, with counts
updated. No text equality, length threshold, buffering until EOF, runtime change,
or provider reasoning field is used. The additional final model.delta preview is
suppressed while its current completed public segment is already displayed.

Validation on published runtime3.6.0: new regression initially 2 failures / 1 pass;
then 3/3 pass. Combined owning durable-public projection and new regression 8/8
pass, server typecheck and touched-file lint pass. Tests cover immediate repair
prefix, exact history, same-event replay, legitimate identical text from different
tool attempts, interrupted preambles and duplicate final previews.

Commands: `node --import tsx --test server/src/__tests__/repair-public-projection.test.ts`;
`node --import tsx --test --test-isolation=none --test-force-exit` with that file and
`server/src/__tests__/durable-public-projection.test.ts`; `npm run server:typecheck`.

This is source-level synthetic evidence, not a claim that private production
attempts were inspected. No private conversation or screenshot is included.
