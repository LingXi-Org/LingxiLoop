# #260: unverified references in public commentary

The final-candidate verifiers validate `candidate.body`, but `activityParts`
previously copied every `publicTextPart.text` and explicit progress text verbatim.
`deliverMessage` persists the combined projection. `NativePart` routes every
text part through `VisualizeText`, which used whole-message completion. Thus a
path from a superseded candidate could become a renderer input after a different,
valid candidate was committed. `checkedPath` correctly rejects that path.

The fix removes active renderer directives from public commentary through the
existing Markdown-aware preview projection. Adjacent prose, literal code examples,
part identities and history remain; only delivered answer text activates a view.
No authorization, path generation, tenant/user checks, runtime version, or iframe
loading behavior changes.

Validation on exact published runtime 3.6.0 (package SHA512 matches the lock):
- New boundary regression: 2 failed before the change, 2 passed after.
- Owning projection tests: 12 passed, 0 failed.
- Actual local PostgreSQL/API visualize tests: 6 passed, 0 failed, including
  same-conversation document HTTP200 and another authorized conversation HTTP403.
- Server typecheck and touched-file Biome lint passed.

Commands: `node --import tsx --test server/src/__tests__/visualize-public-boundary.test.ts`;
`node --import tsx --test --test-isolation=none --test-force-exit` with the boundary,
`durable-public-projection` and `run-activity-projection` test files;
`npm run build:visualize-runtime`; `npm run test:integration -- --file visualize.test.ts`;
`npm run server:typecheck`.

This is a reproduced source-level cause, not proof of the original production
path's provenance. No private production conversation, HTML, credentials or user
screenshot is included. Production diagnostic access remains with the integrator.
