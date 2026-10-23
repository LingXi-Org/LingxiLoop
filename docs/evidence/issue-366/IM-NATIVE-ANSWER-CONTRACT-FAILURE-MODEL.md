# IM guidance must follow the native answer contract

The shared IM rules currently place a coherent explanation and complete
deliverables in the native final response. Those rules are appended to the
public product context even when the trusted driver supports sealed intermediate
answer segments. They conflict with the existing instruction to deliver useful
explanations between tool results. This change removes that specific conflict;
it does not require another preface, increase a budget, or loosen acceptance.

Failure boundaries, written before the product wording change:

- Compile the actual shared IM rules through `ProductRuntimePolicy` and the
  runtime's public `buildPromptContext`. Initial and restored request instructions
  must preserve intermediate native answers when the driver supports them,
  ordinary append continuation, and a final segment that adds missing content
  without repeating sealed text.
- This permission is conditional on the trusted driver's contract. Older
  branches retain the complete native final body and their existing outcome,
  citation, authorization and delivery obligations. Product prose never changes
  the wire encoding or substitutes for a driver capability.
- The same contract applies with or without an authorized `chat.send` tool.
  `chat.send` remains optional and authorized; no new tool is invented. Group
  assignments retain their native-final dispatch rule, and internal tasks and
  scheduled summaries retain their existing workflow.
- Reviewed conclusions still require completed review; citations, resource
  references and complete deliverables still pass normal acceptance checks.
  Earlier segments do not prove future tool results or completed work.
- The request-side owning check is offline and does not establish model timing
  or real delivery success. The full serialized generation-contract audit must
  additionally cover the final combined driver, activated skills and correction
  request before another real qualification. Existing failed receipts, fixture
  thresholds, language requirements and budgets remain unchanged.
