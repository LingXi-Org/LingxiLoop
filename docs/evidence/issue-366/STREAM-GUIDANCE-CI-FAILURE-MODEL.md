# Streaming fixture prompt assertions

CI run 40033570929 on product commit
`67c1a2c51e254863e9a397c6b9f74857f072e453`, with the unchanged formal
LingxiOS 3.8.10 locks, fails two integration assertions after the public
streaming behavior has passed. `memory-public-streaming` still requires
ordinary assistant-content encoding; `visualize-failure-public-streaming`
still requires a product-selected `answer` field. Those literals contradict
the driver-owned framing already established by the product context/harness.

The owning regressions must require the assembled prompt to delegate encoding
and response framing to the trusted model driver, and reject the obsolete
product encoding directives. Preserve every gated provider/SSE/durable replay
assertion, real memory/failed-visualization receipt, private-reasoning exclusion,
final-answer cardinality, progress rules, and model-call count. Do not alter the
provider fixtures, runtime dependency, product implementation, or accepted
outcomes to obtain a pass.

Validate only these two files against the formal 3.8.10 installation in a new
isolated local test database. This is not qualification of the development
3.8.11 package or evidence that the separate live-provider graph failure is fixed.
