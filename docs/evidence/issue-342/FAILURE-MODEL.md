# Visualization intention and delivery

Recorded before implementation. All reproduction inputs are synthetic. The
reported conversation has not been reproduced, and no private body or trace is
included here. Two protocol failures without tool events do not establish that a
visualization was saved or that only its reference was omitted.

## Failure cases and owning checks

- An explicit creation request can follow `skills.load`, a promise and a final
  answer without ever activating authoring. First-turn host instructions must
  route requested creation or an authoring commitment to the public native
  `skills.activate` action before reference loading. Prompt-contract checks and a
  published Worker integration exercise this route; a synthetic model cannot
  establish real-provider instruction adherence.
- A model may ignore that first-turn contract and return an unactivated promise.
  Without trusted action or semantic review there is no machine obligation to
  check. A negative Worker fixture records message success with zero activation
  and zero visualization; this is a documented limit, not delivery success.
- Activation currently does not select the complete skill body, so the model
  must perform another load before it can author. The same exact current skill
  selection through `skills.activate` must supply the complete registered body
  next turn. Stale, wrong-request and unauthorized actions must not select it.
- Reading documentation, examining existing resources, exporting, ordinary code
  and a quoted request must not create an authoring obligation. Loading stays a
  read operation; no user or assistant body regex creates obligations.
- After explicit activation, a promise without a saved usable reference must
  fail the owning authoring check. The Worker must repair with actual tools or
  preserve a partial/inconclusive outcome within existing budgets.
- Protocol failures before any real tool action are not saved-resource evidence.
  Existing protocol/promise integration must retain partial status and no writes.
- A checked current version saved once with a missing final reference needs a
  reference-only repair. The Worker check must observe exactly one save, one
  read and no additional write on repair; refresh must not invoke tools.
- Resource loss, access revocation and cancellation must never satisfy delivery
  or reveal repair candidates. Owning database verification and native Worker
  checks retain current identity, request, audience, cancellation and effect
  idempotency boundaries. No budget or authorization settings are raised.

## Scope

The product changes first-turn routing and complete-skill selection. Native
LingxiOS remains the owner of activation, transaction persistence, limits and
delivery resolution. No runtime code is vendored or patched. Content checks are
independent of these changes. Storage checks prove neither semantic correctness
nor browser execution. Browser checks use only the official tester-army engine.
