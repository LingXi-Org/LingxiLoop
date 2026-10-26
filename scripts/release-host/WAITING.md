# Bounded operation observation candidate (#495)

This code is a software candidate; it has not been deployed or qualified in
production. It does not change the frozen d378 Ops, credentials, network policy,
POST idempotency, resource fences, generations or Workflow identity.

`GET /operations?key=<existing-key>&waitSeconds=45` retains executor
authentication and returns the current journal when the same operation settles
or the wait expires. The default is zero; finite waits from zero through 45
seconds allow millisecond precision. Invalid or repeated parameters fail before
journal access. Missing and terminal records return immediately. Client
disconnects stop local waiting. Only local journal reads occur while waiting;
inactive unknown operations keep the existing independent read-only observation
at entry and at the wait boundary. No GET dispatches an operation or retries a
side effect. Unresolved observations retain reservations and earlier errors.

Workflow host phases persist their original wait deadline in the existing
submission step's output. Subsequent observation GETs wait at most 45 seconds,
also bounded by the remaining per-host-phase `drainSeconds` budget. Durable
replay does not refresh the recorded deadline. There is no five-second network
poll sleep. Each GET timeout includes its requested wait plus the existing
20-second transport margin; an observation step allows five minutes for the
existing maximum four attempts (4 × 65 seconds plus bounded backoff). Expiry
stops queries and leaves the result unknown with ownership held. Existing slow
independent observation/helpers or transport failure can exceed a remote wait;
they do not authorize another mutation. A timeout is never completion evidence.

The exact provider exception message `Too many subrequests.` is classified as
`WORKFLOW_SUBREQUEST_LIMIT` at the host/probe/Worker adapter boundaries and in
durable callbacks. It is not a transient retry code. The Workflow attempts its
fenced blocked transition and does not start recovery mutations for that error.
If the provider also prevents recording blocked, the error propagates with
existing locks held. No new Workflow ID is created to reset a quota. Other
transport errors and exact business HTTP/content assertions retain their rules.

## Trace-based request reduction and limits

Inputs are the actual gen6 trace `runtime-d378-blocked-workflow-detail.json` and
its authenticated `accept-495-runtime-mcp-197e-d378-status.json` host receipts in
the private handoff. Durations below use each operation's own host-created and
host-updated timestamps. The projection changes only observation GET frequency;
it is not a claim that these new requests have run in production.

| Phase | A duration / old GETs | B duration / old GETs | Projected GETs A/B |
| --- | --- | --- | --- |
| prepare | 4.195s / 1 | 5.226s / 1 | 1 / 1 |
| drain | 6.296s / 2 | 6.411s / 2 | 1 / 1 |
| apply | 32.460s / 7 | 41.767s / 8 | 1 / 1 |
| verify | 1.077s / 1 | 1.284s / 1 | 1 / 1 |
| undrain | 3.938s / 1 | 4.748s / 1 | 1 / 1 |

The recorded 25 observation GETs become a projected 10. Keeping the ten initial
lookups and ten POSTs gives 45 → 30 operation requests (15 fewer, 33%). Adding
the unchanged two manifest uploads gives 47 → 32 host requests. Retries,
artifact relay, ledger, probes and Cloudflare Worker operations are excluded.

This optimization cannot guarantee that prepare plus full compatible recovery
fits a provider's complete request allowance. Even with one observation per
phase, ten forward and six recovery host phases require 48 operation requests,
plus two manifest uploads, before probes, frontend operations and other calls.
The parent relayed the account owner's direct confirmation on 2026-10-26 that
the current account uses Workers Free. Its 50-subrequest allowance is therefore
insufficient for this full recovery path, even under the ideal count above.
Long polling alone cannot qualify that path on the current plan. The original
production exception text was not retained; injected classifier tests do not
establish that a quota exception was captured from that production invocation.
Uncached R2 archives retain their per-part relay traffic. A slow phase can need
multiple bounded GETs. Tests verify forward and full recovery mechanics,
preserved deadlines, unresolved ownership and no mutation replay; they do not
simulate enforcement of the production provider's quota or grant its capacity.
