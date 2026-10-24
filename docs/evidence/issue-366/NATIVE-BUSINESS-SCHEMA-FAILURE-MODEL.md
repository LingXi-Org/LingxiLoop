# Preserve native business schemas

The product DeepSeek profile must expose the original native tool schemas and
business arguments. The optional `nativeToolPublicOutput: envelope-v1` setting
changes that provider contract by wrapping each tool's parameters. This change
removes that product opt-in without changing the formal runtime, public-purpose
v3 parser, JSON-with-tools capability, sequential tools, or any budgets.

Failure boundaries, written before the implementation change:

- The actual local HTTP generation request must expose complete product
  parameter schemas equal to the current product catalog, not merely omit a
  known wrapper key. `directory.self` still receives `{}`; the intentionally
  invalid `chat.ask` still receives its original title-only business object.
- Invalid business arguments must fail the runtime's strict batch validation
  before dispatch. A framing error must not stand in for that validation.
  With ordinary native arguments, both provider responses are successfully
  measured; the next request must carry the specific business-schema rejection.
- Preserve exactly two generation calls and no default judge for the correction
  case, both measured token records, zero tool dispatch, private-data exclusion,
  tenant/thread authorization, and all existing streaming/replay assertions.
- Preserve auxiliary transport, its exact optional 503 retry, measured usage,
  settlement identities, real tool receipt, and no replay on the next request.
- Typed public content and native calls remain separate channels. Existing OS
  `react-wire-boundaries` tests cover valid same-response typed answers and
  exclusion of untyped companion prose; this product change does not weaken or
  replace those tests or claim a live-provider graph qualification.

Any new explicit continuation API is a separate change after its public type is
available in the exact candidate package; no cast or unpublished dependency is
used to make this formal 3.8.10 check pass.
