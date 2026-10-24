# Explicit typed-message continuation

Only the SiliconFlow `deepseek-ai/DeepSeek-V4.1-Flash` generation profile with
producer `purpose-json-v3` opts into the public runtime API
`publicTextContinuation: 'typed-message-v1'`. Native tool business schemas remain
unchanged; `nativeToolPublicOutput` remains absent. The release metadata leaf
still returns only `publicTextProtocol`.

Failure boundaries, recorded before the configuration change:

- The actual Worker configuration must carry the explicit continuation option
  for that provider/model/v3 combination. GLM, another provider hosting the same
  model ID, and unrelated models must leave the option undefined.
- Preserve JSON-with-tools disabled only for the existing DeepSeek profile,
  sequential native tools, strict public-purpose v3, no thinking, recovery and
  all first-byte/idle/request/token budgets. No native envelope may be enabled.
- The shared public deployment leaf must not gain model-specific options.
  The runtime owns private-v2 stripping and generation/auxiliary separation;
  product configuration must use the public option without a compatibility
  adapter or a type cast around an unsupported runtime type.
- Formal 3.8.10 does not expose this API. Its locks remain unchanged while the
  new public type is pending. Configuration-only checks are not evidence of
  new runtime behavior, successful type checking, or provider qualification.
  New-package type/owning integration verification waits for the exact frozen
  development package. No live provider call is part of this change.
