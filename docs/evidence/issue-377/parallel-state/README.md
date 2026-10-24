# Parallel authorized state preparation

The current deployed source `a6b54673` still serializes the first `/state` GET
after the entire page document/resource preparation. A new page already has its
own authorized token at that point, so those two independent reads can overlap.
The change starts a real same-page state GET alongside resource assembly and
waits for both before returning a mountable page. The first `getState` consumes
that completed fresh read exactly once; subsequent calls still issue a fresh GET.
It never substitutes the state snapshot in the page POST for this GET.

Both tasks share initialization cancellation. Failure aborts pending work and
revokes the new page. Owner/scope are checked again before returning the document;
`projectState` still rejects older revisions in favor of newer same-scope state.
No changes to page permissions, tokens, source admission, CSP, guest rendering,
ready semantics, runtime dependency, model configuration or schema are included.

## Bounded comparison

The existing real-host `host-preparation.test.ts` fixture was used on both sides
with the same Node 22.23.3 / Linux environment and dependency tree. It injects
120ms independently into one resource response and the state response. These are
host/network scheduling samples, **not browser paint, real provider, generation,
production timing or population percentiles**. No large browser replay ran.

| Sample | Before prepare + initial state (ms) | After (ms) |
|---|---:|---:|
| 1 | 280.016 | 157.142 |
| 2 | 245.044 | 122.357 |
| 3 | 241.077 | 122.849 |

The three-sample median changed 245.044 → 122.849ms (49.9% lower).
Before, every state request began after the resource response completed; after,
every state request began before it completed. Request authorization and the
number of initial state GETs are unchanged. `timings.json` retains all start/end
points and source hashes rather than inferring overlap from total duration.

## Checks and boundaries

Before implementation, the new failure-model cases failed 5/5 while the existing
public-cache case passed. Final owning tests passed 7/7, covering overlap,
newer-peer revision protection, subsequent fresh reads, initial-state failure,
no mountable return while state is pending, shared cancellation, scope change
between the early state result and resources completing, and public-resource
cache isolation. Biome lint and a typecheck of the two owning files plus their
imports passed. The initial temporary typecheck config omitted the Node type
root; that setup failure was corrected, without changing source or assertions.

Commands (from this checkout):

```sh
node --import tsx --experimental-test-module-mocks --test --test-force-exit src/features/chat/visualize/web/host-preparation.test.ts
node_modules/.bin/biome lint src/features/chat/visualize/web/host.ts src/features/chat/visualize/web/host-preparation.test.ts
```

The first six-case after run also passed; the final run adds the account-switch
counterexample. The final seven-case raw output is retained here. Existing
#377 browser failures, earlier unmet timing budgets, rendering/handshake cost,
generation-to-save/delivery timing and actual user-device distributions remain
unchanged evidence. This repairs one confirmed initialization barrier and does
not claim complete #377 production performance acceptance. The sole integrator
owns CI, merge and any actual rollout.
