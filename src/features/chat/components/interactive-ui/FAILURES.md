# Interactive explanation acceptance failures

Authored before implementation. The browser fixture exercises production rendering and controls with synthetic API responses; it does not prove model or server authorization behavior.

- Draft/unfinished, unconfirmed delivery, stale revision and nested read-only messages must never submit actions.
- An unknown component, invalid property, resource overrun or calculation failure must show the explanation fallback without exposing DSL or breaking adjacent messages.
- Continuous slider input must update curves and text immediately, without model or action calls. Idle state saves coalesce and do not race a later edit.
- Restoring state must finish before editing is enabled, must not overwrite a later interaction, and must not replay an action.
- Version conflicts, revoked access and network failure must remain visible; stale saves must not silently overwrite another tab.
- Double clicks must reuse the same action request; uncertain failures must retry the same idempotency key and payload.
- Parameter identity, type, unit and semantic changes reset incompatible state with a user-visible notice.
- CLT and Monty Hall simulation changes cancel old workers; obsolete replies cannot replace the latest output.
- Every graph needs numerical text; keyboard, touch, narrow width, dark/light themes and reduced motion must remain usable.
- Mixed layouts must combine controls, explanations, tables, predictions and steps; the library must not require a preset full-page experiment.

Repeatable evidence: `e2e/web/interactive-ui.e2e.ts` on the isolated `e2e/interactive-ui.html` fixture, plus its official e2e report and named screenshots. Server and live-model acceptance remain separate.
