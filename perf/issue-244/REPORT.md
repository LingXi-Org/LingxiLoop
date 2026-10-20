# #244 result and limits

Ship the bounded initialization/recovery fix. Do **not** claim normal content
loading is faster or mark the whole performance request complete.

Baseline: `a29060a7681b0d80001292bf83b63fbaa7d04566`. Current main fetched during
work: `0767185956086a760c322ed4ac4eaf59eff0cb0c`, which includes #243 (merge
`577974a398967ac496dbaf783838874ce35461f9`); no intervening visualization diff.

## Confirmed failure and fix

The baseline remains `loading` at 16,520.5ms when authorized resource responses
are held. Its handshake timer has not started. The input remains usable. Raw
failure, screenshot and transport records are retained, not rewritten green.

One 15s initialization budget now starts before document acquisition, covers
page/resource requests, the existing late fresh-state read and SDK handshake.
The first failure is terminal, aborts fetches, unmounts and closes its bridge.
Disposal no longer awaits an unbounded preparation. An old page cannot overwrite
or revoke a newer attempt. Local release/retry does not await remote DELETE;
cleanup attempts time out after 2s, deduplicate and retain the existing scoped
retry queue. No protocol, capability, CSP, iframe permissions, state ordering,
retention limits, provider, DB schema or dependency changed.

Four official browser fault cases passed: held create/resources/state and absent
SDK initialization; each became error at the 15s budget and recovered to a real
clickable guest while DELETE was held. After transport recovery only the new
page remained active. These are explicit local API fixtures with the production
host and original SDK/runtime, not live provider or production authorization tests.

## Rejected performance experiment

Three interleaved A/B short pairs used the same complete D3+calendar fixture,
250ms per-resource delay, no-store, Chromium 1440x960, one/three cards, cold,
switch, return and reentry. 12 browser cases passed (48 scenario observations).
The experiment downloaded the kit's fixed vendors in its first network wave.
HTTP/1's connection queue still serialized eight resources per card.

Observed median first actual content paint (milliseconds, n=3 each):

| Cards / scenario | Baseline | Experiment |
| --- | ---: | ---: |
| 1 / cold | 1337.7 | 1959.6 |
| 1 / switch | 1039.5 | 1102.0 |
| 1 / return | 30.9 | 31.5 |
| 3 / cold | 2546.3 | 3203.2 |
| 3 / switch | 2264.0 | 2284.6 |
| 3 / return | 31.5 | 26.5 |

AllReady, actual click completion, network starts/durations/bytes and all samples
are in the raw JSON. Click completion includes runner observation overhead.
The first candidate pair overlapped TypeScript compilation; cold samples also
show substantial shared-cloud CPU variance. These are observations, not causal
percentiles or production speed claims. Resource requests remained 8/24, retained
return/reentry remained zero. No successful sample was selected to claim a win.
The complete experiment patch is retained but **is not in the product**.

After rejecting it, rerun the resource-stall/retry case on the final document
assembly. Other fault results precede this exact restoration; no extra provider,
device or broad browser campaign is required by the user's latest instruction.

## Remaining work and boundaries

- Normal cold-content acceleration is unproven; the deadline fixes indefinite
  loading and recovery, not long-but-successful generation/initialization.
- Generation/save/final-reference delivery and numerical/SVG red cases remain in
  #243's immutable evidence; this branch makes zero paid model calls.
- An aborted POST can commit without returning its capability. Browser abort
  does not prove server rollback; existing same-instance replacement/expiry is
  the recovery boundary. No production state was modified to verify it.
- Main-thread-blocking author code can delay browser timers. We do not weaken the
  sandbox or execute incomplete scripts to conceal that limitation.
- Native clipboard permission and real-touch coverage remain unverified, unchanged.
- #246 separately handles the demonstrated gutter/radius clipping conflict;
  generated fixed SVG coordinates without viewBox are not repaired globally.

Delivery is a draft PR only. The designated integrator owns CI/release/production
health checks. Do not close #244 solely on this partial result.
