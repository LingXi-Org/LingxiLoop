# Runtime 3.8.4 combined qualification

Before executing the real-provider development fixture:

- Use only a disposable loopback PostgreSQL database named `runtime342_*test`,
  dedicated local coordination, and the exact formally published runtime on
  both control plane and Worker. Do not modify a production conversation.
- Keep the original configured provider and model, shared price snapshot,
  measured ledger, cancellation, and finite call/token/cost/time limits. Do not
  copy credentials into files or publish provider payloads.
- Confirm the qualified native-tool configuration before any paid call. Strict
  public-purpose framing remains active when native JSON mode is omitted.
- An explicit synthetic visualization must activate the current registered
  contract, save a usable resource once, read it, and deliver its literal
  authorized reference. A promise, draft or failed resource is not success.
- The official browser must read the real product resource and observe the
  requested interaction. Interaction must not cause another model call.
- A subsequent simple arithmetic request must return the correct useful answer
  in one measured model call, with no inherited visual review or correction.
- Report failed/partial checks as such. Reports contain counts, statuses and
  hashes, not private conversation content. These are development checks, not
  a claim that a user's original production run was replayed or verified.

The opt-in fixture is prepared in
`server/src/__integration__/visualize-authoring-provider-live.test.ts` and
`e2e.visualize-provider-342.config.ts`. Preparation alone is not a passing result.
