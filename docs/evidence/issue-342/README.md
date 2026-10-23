# Issue 342: explicit visualization authoring

The product now treats exact native `skills.activate` selection as selection of
the complete registered skill body in the next prompt. Requested creation and
authoring commitments use this route directly, without a preliminary load or a
second load after activation. Documentation reads and exports continue to use
`skills.load` and create no authoring obligation. Native LingxiOS remains the
owner of activation, permissions, cancellation, budgets and effect persistence.

The product's deterministic delivery checker still requires a usable authorized
current-request resource reference. This change neither parses conversation text
to invent obligations nor adds a model router or unconditional semantic review.

## Validation

- Focused skill-selection checks: 8 passed, including exact activation,
  activation-only permission, stale hash, request change, revocation and complete
  current guidance after compaction.
- Real PostgreSQL and published Worker: read-only use creates zero activations
  and zero documents; explicit authoring rejects a promise even when semantic
  review returns no missing work; one save and one read deliver after a
  reference-only repair; cancellation after activation prevents saving.
- Owning delivery checks cover current authorship and request version, corrupt
  or missing resources, native unavailability, revoked audience and cancellation.
  Revocation reveals no saved repair candidates.
- Existing Worker regressions cover reference repair after multiple revisions,
  an exhausted hard model-call limit, and two protocol failures before a
  promise-only candidate. The latter remains partial/inconclusive, performs zero
  visualization writes and has stable effect-free replay.
- Server lint and typecheck pass. Independent review found a conflicting old
  tool-description instruction; both tool descriptions now follow the same
  activate/load routing contract.

Repeat with `node --import tsx --test --test-force-exit
server/src/__tests__/visualize-skill-loading.test.ts`, `npm run server:lint`,
`npm run server:typecheck`, and `npm run test:integration -- --file
visualize-authoring-intent.test.ts --file visualize-delivery.test.ts --file
visualize-delivery-repair.test.ts --file visualize-incomplete-conversation.test.ts`.
Integration requires a dedicated disposable test database and Redis namespace;
it resets that database. No production service is needed.

[Worker receipt](receipts/authoring-intent.json) contains only synthetic scenario
names, counts and statuses. These checks establish the product tool handoff and
delivery boundaries. They do not reproduce the reported private conversation,
prove real-provider instruction adherence, or identify the original wire-level
protocol failure. No private conversation, screenshot or raw trace is published.
