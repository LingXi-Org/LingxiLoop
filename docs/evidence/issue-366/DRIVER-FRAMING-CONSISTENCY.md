# Failure model: product semantics and driver-owned framing

The product harness still prescribes a complete native object, field order and
`outcome:null`, while the visualization host adapter says the harness governs
framing. These conflict with the current context rule that the trusted driver
alone selects the content/tool wire contract. This is a source-level consistency
defect; it does not prove the cause of any complete real-provider failure.

The initial prompt, selected visualization skill and restored prompt must all
defer encoding and branch selection to the driver. Product instructions retain
grounded useful answers in the same necessary tool turn, no separate preamble,
no repeated delivered body, no invented result, private-reasoning protection,
honest failed delivery, stable task identity and existing authorization rules.
They must not duplicate a wire schema, hard-code a terminal/tool outcome or
require a particular tool-call envelope. Changing these instructions must change
the host harness and adapted skill identities so old bindings cannot silently
resume under different rules. The pinned upstream skill bytes remain untouched.

Write contract regressions against the existing conflicting instructions first.
Exercise initial, selected and restored prompt assembly plus both visualization
host-adapter entrypoints. Keep the existing readback, delivery, pagination,
permission, context-budget and identity checks. No provider, database, protocol
parser, retry policy or budget change is part of this repair.

Qualification artifacts must retain the upstream fixed codes
`native_envelope_invalid` and `terminal_outcome_required` without accepting
arbitrary strings or copying provider content. Add their exact enum values only
to the test-artifact filter; existing unknown-field and bounded-output tests
remain. This does not change production error mapping or reinterpret old traces.

Validation: before implementation, prompt contracts produced 11 passes and one
failure on the existing hard-coded native object/outcome instruction; diagnostics
produced two passes and one failure because the new fixed codes were omitted.
After the repair, the two owning suites passed all 15 tests with no skips.
The pinned vendor verification also passed (223 files, including the unchanged
24-file skill tree). No real-provider completion or latency result is implied.
