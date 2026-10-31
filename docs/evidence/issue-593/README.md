# #593: first-decision contracts and Design guidance

Scope: isolated Loop change on published `@lyyzka/lingxios@3.8.19`, based on
`5014f87a`. No SDK source, package pins, product migrations, Slides editor or
Canvas view layout changes. No production writes, deployment, merge or issue closure.

The initial unit regression failed on the old implementation: no registry-derived
selection directory, guidance-dependent tools already callable, reference schema
missing the actual page set. The candidate uses the existing authorized tool
catalog, registered skill index and deployed reference files. It supplies the
load/activate distinction and exact withheld schemas before selection. Design
operations become callable on the next model decision only after a successful,
current-version/hash `skills.load` receipt; the complete registered skill remains
in every selected prompt. `format.md` is advertised before the first reference
read and valid pages are enforced by the same Zod schema used for admission.
Business reads must use the current authorized file listing. SDK execution and
product authorization, original request binding and explanation validation remain.

Only Design exposure is gated in this change; Slides tooling and the separate
#594 view-layout work are outside the implementation scope. The common skill
routing guidance also correctly describes other registered no-delivery skills.

Reproduction uses a **dedicated local test database** and Redis. The existing
`server/scripts/bootstrap-runtime-patch-test-db.mjs` proves the real formal18
product60 source, formal19 provenance CAS and migration-free current startup.
Ordinary formal19 migration correctly refused an empty database first; no
provenance checks were bypassed. The bootstrap was run with saved package auth.
An initial npm-exec invocation selected Node27; subsequent owning tests used the
session's Node24, and repository CI uses Node22.

Commands:

- `npm run server:test` (includes `first-action-contracts.test.ts`).
- `npm run server:typecheck` and `npm run server:lint`.
- `npm run test:integration -- --file runtime-first-action-contracts.test.ts --file runtime-issue560-delivery.test.ts --file artifact-app-boundary.test.ts --file visualize-delivery.test.ts`
- With the existing authorized SiliconFlow profile, explicit proxy support and
  the same isolated test target: `LINGXIOS_LIVE_ARTIFACTS=1 ISSUE593_EVIDENCE_PATH=docs/evidence/issue-593 npm run test:integration -- --file runtime-first-action-contracts.test.ts`.
  The fixture records sanitized call contracts/receipts and generated public
  artifact files, never provider credentials, prompts or private reasoning.

The deterministic fixture uses the exact production request
“为我在画板中讲解flashattention”, the real native Worker, product authorization,
PostgreSQL, Redis, upstream checker and recording IM HTTP adapter. It loads the
skill, reads `format.md` and the current file list, reads the existing canvas,
writes a real Design Component plus index using `ifMatch`, calls `design.check`
and delivers. The HTML fixture is authored test content, not model evidence.
The three native activation variants retain the existing explanation correction
and bounded-call failure cases and add authoring-only activation without an
explanation declaration. No failed or unique coverage was deleted.

Real-provider history is retained separately. The initial run failed before any
business action (unclassified model/transport failure with no observed provider
status); the initial collector did not yet count model-failure diagnostics.
The next run first loaded the correct skill, read the real format and existing
file successfully, but three `public_answer_first_required` protocol failures
left an empty canvas and a partial delivered message. Its zero checker problems
on an empty canvas did **not** establish delivery. A final candidate adds guidance
that skill examples never replace the trusted driver's mandatory output binding;
its actual result is recorded separately below. A retry's final success cannot
stand in for the strict zero-failure acceptance.

Browser rendering, interaction and teaching quality are separate from a successful
format check. No browser validation has been performed. No production acceptance
or delivery to the production conversation is claimed by these local fixtures.

Final local real-provider observation (`real-provider.json`): 12 observed model
requests, 102776ms; `skills.load`, `design.current`, `format.md`, existing canvas
read and two writes all succeeded, with **zero failed business receipts**. This
is **not accepted**: two `public_answer_first_required` failures, one additional
unclassified/provider model failure, no `design.check` receipt, and only the
Main board was written. Independent format checking found two missing files
(`Method.dc.html`, `Limits.dc.html`) referenced by its index; the run ended
`partial`, delivery `delivered`. That delivery is the partial message, not proof
of complete artboard delivery. Generated files are retained unchanged; no missing
board entries were deleted to manufacture a green check. Follow-up requires
qualifying the published SDK's native output protocol with the real provider
before the full issue acceptance can be claimed. Browser absence is an additional
unverified boundary, not the cause of this failure.

Candidate validation: server unit **151/151**, server typecheck and lint passed;
test-selector regressions **9/9**. The final deterministic native fixture passed
**1/1**, with `accepted:true`, all seven business/inspection receipts successful,
zero protocol/model failures, a persisted FlashAttention artboard and checker
`problems:0` (`synthetic.json`). Additional selected integration: activation
variants **3/3**, artifact HTTP boundary **4/4**, visualize delivery **6/6**, native
authorization faults **3/3**, chat recovery **7/7** (24 total including the new
native fixture). Artifact HTTP initially failed on an absent local Slides static
build; running the unchanged existing `npm run build:slides-editor` prerequisite
restored the asset and that entire file passed. No Slides source was modified.

CI and independent review against the draft's final SHA remain required. This
change is a reviewable root-cause repair for skill selection, schema discovery
and guidance ordering. It is not a claim that #593's complete real-model
acceptance is closed; the native output protocol and incomplete generated boards
remain explicit follow-up gates for the parent integrator. No SDK publish,
merge, deployment, security/configuration widening or production data action was
performed.
