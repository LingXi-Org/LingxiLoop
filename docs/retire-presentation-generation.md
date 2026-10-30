# Issue583: retire generated slide decks

Status: implementation for review; **not approved for production migration or
object deletion and not deployed**. Main baseline: `5ff21f64`. The isolated
branch removes the product's HTML lecture-deck generation capability. The
formal SDK remains exactly `@lyyzka/lingxios@3.8.17`; manifests and lockfiles are
unchanged. No credentials, network policy or object permissions change.

## Consumer evidence and boundary

| Removed owner | Consumers removed |
| --- | --- |
| `server/src/modules/presentations` | API router, Agent tools, outline approval, generation queue/Worker, rendering/validation/version/download, scheduled artifact GC |
| `src/features/presentations` | business message card, conversation surface state, desktop lazy drawer/skeleton |
| Dedicated integrations | knowledge provider's `getPresentationMaterial`, Open Notebook route/models and image extraction used only by that route |
| Dedicated controls | `PRESENTATION_HTML_ENABLED` in app stacks, local compose and environment; operations/admin resource entries; tool labels and presentation-specific authorization mapping |
| Vendor and documentation | `third_party/interactive-lecture-deck`, its notices, `docs/PRESENTATIONS.md`, dedicated tests and stale references |

Retained consumers were traced before deletion:

- `pptxviewjs`, the `pptx-viewer*` components, `FilePreviewDialog`, viewer source
  dispatch, uploads and `homework-presentation.ts` implement user file reading.
  The unified preview introduced in PR576 is retained.
- Open Notebook's page/section location parser is also used by ordinary scoped
  search; it remains as `_source_location`. `pypdf`, `python-docx`, `officeparser`
  and their dependencies still serve file extraction. There is no remaining
  generation-only npm/Python package to uninstall.
- SDK `capabilities[].presentations`, memory-summary cards, run presentation
  provenance/pool, public text/trace, zcode presentation methods, case-cover
  presentation and HTML `role="presentation"` serve other features.
- Frozen historical SDK projection fixtures and already applied migrations keep
  their exact source/checksums. `0001_v1_baseline.sql` is unchanged.
- Shared LLM billing, authorization, action intents/receipts, approvals and events
  remain as audit/execution records. They do not register or restore retired
  actions. No shared ledger rows or generic runs are deleted.

Old IM data is decoded through the current supported data-card allowlist, so an
unsupported card does not invalidate adjacent text, files or nested messages.
New messages still use the strict schema. Generated cards have no renderer or
reader. Source-backed download manifests must have a current product authorizer
(currently `document:`); source-free generic runtime artifacts remain supported.

## Destructive database impact

Migration `0059_retire_presentation_generation.sql` uses the migration runner's
transaction, a 5s lock timeout and 60s statement timeout. It has no `CASCADE` and
no DDL is added to runtime startup. All five generation tables and their rows,
constraints and indexes are removed:

- `public.presentation_jobs`
- `public.presentation_evidence`
- `public.presentation_pages`
- `public.presentation_versions`
- `public.presentations`

The cyclic latest-version FK is explicitly removed first. The early product
extension `lingxios.lecture_checkpoints` and `lingxios.lecture_decks` is dropped
if present. Those tables are absent after the existing native runtime reset on
the current supported schema; they are not part of the formal SDK schema.

Typed generation cards and manifests are removed from
`public.im_send_acceptances.payload/echo`, `lingxios.agent_results.message` and
`lingxios.agent_steps.artifacts`. `refs.presentationId` is removed in those
rewritten records. Messages and generic run identities remain; text, other
cards, artifact order and user-uploaded PPTX references remain. This intentionally
changes generated content in historical results. It cannot be undone by
checking out old code. WuKong's independent stored messages are not rewritten;
unsupported data cards are omitted at its history decode boundary.

No production counts have been queried. Before production approval, the sole
publisher must obtain exact table/rewritten-row counts and the object manifest
below, the intended execution window and acknowledgement that deletion is irreversible without an available backup. A new backup system is not a prerequisite; the user decides whether to keep a recoverable copy. A synthetic
upgrade with one deck/job, mixed IM content, generated/shared manifests and a
nonempty LLM billing row verifies this boundary; it does not estimate production
impact.

## Object inventory and cleanup

`scripts/retire-generated-decks.mjs` is a one-off operator tool. Startup, Workers,
CI and migration do not import or run it. It uses the configured database and
existing private product/runtime storage clients without changing config.

```sh
# Read-only inventory BEFORE0059; creates a new private local manifest file.
node scripts/retire-generated-decks.mjs --plan /tmp/issue583-manifest.json
# Only after specific approval of that manifest digest and migration0059:
node scripts/retire-generated-decks.mjs --apply /tmp/issue583-manifest.json APPROVED_SHA256
```

Deletion scope is limited to:

1. Product bucket (`R2_BUCKET`), prefix **`presentation-artifacts/`**. Every
   literal reference to a candidate key in a public/SDK table outside the five
   dedicated generation tables preserves that object. A conservative match can
   therefore retain an object for manual review. Scans time out rather than
   treating an incomplete reference inventory as safe.
2. Separate runtime bucket (`LINGXIOS_R2_BUCKET`), **individual** keys
   `artifacts/SHA256(JSON([tenantId,agentId,runId]))/sha256`. Candidates require a
   recorded artifact manifest whose `source.ref` starts `presentation:`.
   Results, steps, action receipts and events supply manifests. A different or
   unknown source referencing the same content hash in that run preserves the
   object. No runtime prefix is deleted. No `workspaces/` object is selected.

Before deleting anything, apply verifies the approved file digest, database
name, schema59, exact buckets/key scope, refreshed shared references, ETags and
sizes. Deletes use individual keys and `IfMatch`; per-object receipts identify
successful deletes if a later operation fails. Missing objects are harmless.
The manifest is not a byte backup. Unreferenced staged runtime objects without
an attributable manifest are deliberately not guessed; retain them for the
shared runtime's retention policy.

User upload prefixes (`attachments/`, `knowledge-sources/`, `case-images/`,
avatars and email attachments), Open Notebook source objects and the shared
runtime workspace bucket namespace are outside the deletion set.

## Required release order — pending specific approval

The unapproved `up`, `servers`, and `workers` commands stop before any remote
or deployment action while the retirement guard is present. Production 0059
also refuses to run without its separate explicit maintenance flag. An ordinary
merge can enqueue CI, but cannot run a destructive automatic rollout; do not
merge the draft until the parent has obtained specific approval.

1. Using the configured read-only environment, generate the private `--plan`
   manifest before migration. It includes existence and row counts for all seven
   tables, counts of actual JSON field rewrites, exact candidate keys, ETags and
   sizes. Database bodies and signed URLs are not returned or written. Review the
   manifest digest, counts, scope, recovery choice and maintenance window with the
   user. Without a deliberately retained or existing backup, deletion cannot be
   recovered; a new large backup system is not a prerequisite.
2. After explicit approval, the designated publisher stops both old Workers
   gracefully and then both old API containers, using the existing SSH access:
   on app-a run `docker stop -t 150 lingxiloop-app-a-worker-1` and
   `docker stop -t 30 lingxiloop-app-a-lingxiloop-1`; on app-b run the same
   commands with `app-b`. Verify all four are stopped, drain any other writers,
   and rerun the read-only inventory against the frozen58 state; if the digest
   changes, obtain approval for the new concrete manifest before proceeding.
3. With writers still stopped, run the target image's existing `db-migrate`
   compose service explicitly with `-e LINGXILOOP_RETIREMENT_0059_APPROVED=true`.
   The migration requires the exact installed formal3.8.17 or3.8.18 package, matching locks, schema14 and protocol capabilities. A
   failed transaction rolls back; investigate before any retry. Verify 0059 is
   recorded and the second migration is a no-op.
4. Keep all writers stopped. Run `node scripts/retire-generated-decks.mjs --apply
   /tmp/issue583-manifest.json APPROVED_SHA256` against the approved manifest;
   retain per-object receipts and stop on an uncertain outcome. The apply path
   rechecks shared references and object ETags/sizes. Do not infer recovery from
   the manifest: it contains metadata, not object bytes.
5. Only after migration and approved cleanup, start schema59 via
   `LINGXILOOP_RETIREMENT_RELEASE_APPROVED=true npm run deploy`, and verify both
   slots, public readiness, PPTX preview/extraction, ordinary chat and source
   access. This explicit release flag is not set by CI. Close583 only after the
   release verification. The guard intentionally requires this explicit flag on
   subsequent release invocations while it remains in the code.

Before database migration, Git can restore removed code. After migration,
rollback requires the reviewed database backup and matching application; after
object deletion it also requires the object backup. Do not deploy schema58 code
against schema59 or imply that Git revert restores rows/bytes.

## Verification

All executable checks here use isolated synthetic data, never production:

- Formal SDK3.8.17 installation succeeded; no file dependency/source substitute.
- Formal3.8.18 registry archive SHA-512 matches the official registry receipt
  `sha512-KrOpucNxgYd8zA4Ymfj4jxomxfIBwtY6Xinh4zKHbfn+qW7OOYUxDREgqDbS4OiOpquOBvpE4ijtDoxDIguc5A==`.
  Its schema SHA-256 `c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f`
  matches official tag `v3.8.18` and the existing schema14 baseline. The actual
  package declares protocol11/publicText3/runTrace1. In an isolated checkout
  with the verified package and matching synthetic copies of the four formal
  receipt/manifest files, product58-to59 migration, shared-inventory and release
  plan tests passed. The branch's actual dependency and locks remain3.8.17.
- Web/server/admin TypeScript checks; web lint completed with existing warnings.
- Web smoke:137 passed. Server smoke:135 passed. Admin smoke:8 passed.
- Owning integration:52 homework and20 knowledge/file-authorization checks passed.
- Open Notebook RAG contract:29 passed; affected Python files pass Ruff.
- User file format dispatch, real PPTX extraction fixtures, unsupported old-PPT
  behavior and mixed retired-card history:13 passed; extended IM/history and
  object-retention checks:25 passed.
- Fresh schema1–59 initialization followed by `db:migrate` no-op succeeded.
- Dedicated58–59 upgrade/no-op test verifies generated removal, unchanged
  project state, shared artifact, LLM billing and SDK installation provenance.
  An unexpected shared FK aborts and rolls back both DDL and rewritten outputs.
- Web production build completed (54.38s; existing vendor/chunk warnings).

The final report records the additional owning integration, Open Notebook,
build and independent review outcomes. Production inventory/deletion, deployment
and actual browser interaction are intentionally unperformed in this branch.
