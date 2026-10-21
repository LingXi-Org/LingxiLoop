# Current saved-reference repair

Issue [#273](https://github.com/LingXi-Org/LingxiLoop/issues/273), based on
`63948c598b9778a35941f3dcabf8ef57e2e2d6d8`. Runtime remains published 3.6.0;
native schema 14 / product migrations 50 are unchanged.

## Finding and change

Ordinary `visualize.save` returned a path/hash but no literal display reference
or stored version. Missing-reference verification always instructed another
save/read, even after revisions had already been saved and checked. This is a
source-confirmed contract gap, not proof of the original private case's cause.
The status quoted in the report also occurs while work remains leased, and later
evidence includes a final visualization placeholder. Permanent lack of a final
reference must not be inferred from that earlier status. Skill pagination,
resource loading, and process text in final prose are tracked separately in
#272, #274, and #275.

Save and tool read now return the exact literal reference and actual stored
version/hash. The save result comes from the same transaction; an unchanged
retry does not invent a new version. A missing-reference repair receives at most
three current authorized storage candidates, in path order with an explicit
truncation flag. It checks binding, frozen audience, actor access, tenant,
conversation, run, agent, principal, request version and stored integrity before
exposing any candidate. Only metadata is returned, never HTML in repair hints.

The hint distinguishes an omitted reference from a real content error. It asks
the model to fix known errors, or use an already checked version's literal
reference without resaving solely to obtain one. Candidates are not automatically
selected, appended, displayed, or marked delivered. The existing final native
obligation and product authorization/readback guards remain authoritative.

## Reproduction and minimal checks

The failure model was written before implementation. The public-Worker fixture
fails on the base with `save supplies the exact usable reference` (`undefined`).
With the change, the same sequence reaches delivery through real PostgreSQL and
the published public Worker, using a deterministic model and recording IM sink.

| Synthetic sequence | Model generations | Content reviews | Saves / reads | Repair continuations | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Three revisions, checked final version, omitted reference | 8 | 1 | 3 / 3 | 1 | Current v3 delivered; no fourth save |
| Root cap of two calls: save, read, attempted final | 2 | 0 | 1 / 1 | 0 | Failed; draft preserved, no invented answer |

The normal fixture has a 12-call ceiling, below the product default; no work or
repair limit was increased. Runtime 3.6.0 has no fixed maxTurns. A finalization
reserve is not part of this patch, and a hard root limit can still prevent the
next model invocation. This boundary is explicitly tested, not concealed.

Four owning integration files pass **17/17**, including candidate scope filters,
corruption exclusion, no-op versions, bounded lists, authorization-before-query,
and revocation/cross-run overwrite after a hint. Server typecheck, server lint
and diff checks pass. Existing document-read API shape is preserved; only the
native read tool receives the added reference metadata.

```sh
npm run test:integration -- \
  --file visualize-delivery-repair.test.ts \
  --file visualize-delivery-repair-boundaries.test.ts \
  --file visualize-delivery.test.ts \
  --file visualize-runtime.test.ts
npm run server:typecheck
npm run server:lint
```

Use a dedicated migrated test PostgreSQL/Redis target as required by the runner.
Receipts: `worker.json`, `checker-boundaries.json`, `verification.json`.

## Limits and release

No private production conversation/HTML or real provider was accessed. These
checks prove transport, storage, authorization and bounded repair behavior, not
natural-model compliance, semantic correctness of arbitrary HTML, browser
execution, or production latency. A path still refers to current mutable content;
version/hash metadata is not a permanent immutable-reference contract. Final
verification continues to reject stale scope or authorization.

Merge with #272's tool-description edits and #275's newer process/answer routing
instructions; do not restore process narration in final answer text. No migration
or dependency update is required. The sole integrator publishes the immutable
image and verifies both Web and both Worker services through the existing Komodo
path. This development report is not a deployment receipt.
