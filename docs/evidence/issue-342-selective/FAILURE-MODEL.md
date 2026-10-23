# Selected visualization workflow review

Recorded before implementation. This follow-on closes a selected-workflow gap
left explicitly visible in PR #343. It neither infers arbitrary natural-language
requests nor treats every read or loaded skill as an authoring obligation.

## Owning failure cases

- An exact current registered visualization skill load, followed by a promise
  without activation or a saved result, must nominate one focused review. When
  the current human request requires creation, the missing result must drive
  bounded real-tool repair or remain partial. A non-empty promise is not proof.
- Loading documentation or reading/exporting an existing view must be allowed
  to pass that same focused review without creating an authoring obligation.
- Ordinary answers without a selected visualization workflow require zero
  semantic-review calls. Other loaded skills cannot nominate this review.
- Current native activation routes through deterministic delivery verification.
  A delivered valid current-request reference needs no semantic judge from this
  selector. An activated missing reference needs existing resource repair.
- Exact `visualize.read_reference` selection of `SKILL.md` is the same product
  workflow selection. Arbitrary reference reads, stale registry identities,
  malformed selections, incomplete execution steps and old requests are inert.
- Revoked grants/actions must not select a stale workflow or expose content.
  Current authorization, cancellation and effect idempotency remain native.
- The control plane must independently require the same current-candidate,
  current-request and trusted-rubric hash review scope at final commit. A stale
  or absent review cannot become complete; explicit disabled review cannot
  bypass a required scope. Read-only selection creates no durable obligation.
- The policy identity must change when the registered trusted rubric changes.
  No model text, stored HTML, user body, widget data or tool result supplies rules.

The public native selective-review contract is implemented upstream, then
consumed through its formal dependency. Product tests own selection and actual
Worker cases; upstream tests own review identity and final-commit enforcement.
No runtime source is vendored, no permission is added and no budget is raised.
