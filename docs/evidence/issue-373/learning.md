# #373 artifact learning and Skill delivery

Base: `2686f475eac075bc9033f13714d5d6bbfa5078eb`.
Environment: 2026-10-24 UTC, isolated `/tmp/loop-373-learning`, Node22.23.3,
formal existing lock/dependencies (`@lyyzka/lingxios`3.8.11,
`@assistant-ui/react`0.15.16 installed, Lexical integration0.2.11,
`react-resizable-panels`4.12.3 installed). No installation or provider/production
read. Root is sole integrator/release owner.

## Audit and change boundary

- Existing Canvas already supports markdown/document edits, selected-text
  references with frame revision, expected-revision conflict handling, scoped
  feedback with cancellation/scope rechecks. PresentationViewer already has
  durable version selection and download. Existing GenUI supports retained DOM,
  scoped synchronized widget state, authorized resources, guest follow-up and
  original-vs-current tweak preview. These were reused, not replaced.
- Installed resizable panels already implement active-drag panel pointer-event
  suppression and keyboard separator behavior. No second drag/scroll controller
  or copied external resizer is introduced.
- New host-level question entry allows continuation when a guest has no question
  button. An editable dialog reuses existing `followUp`/host gesture/scope checks
  through a thin page facade and retained-owner forwarding. Cancel/reopen and
  unconfirmed send preserve text while that card remains mounted; accepted send
  reports continuation in the original conversation. This is not durable
  question-draft recovery across refresh.
- Tweak submission reports accepted delivery, retains settings after failure,
  disables edits while pending and disables a second submit until settings change.
- Hint/explain/check actions append an editable request to the existing composer,
  preserve the exact attempt and focus, and do not send. Runtime/provider effort,
  budgets, formal permissions and learning-evidence producers remain unchanged.
- AGENTS now discovers existing Skills; one central learning guide links code,
  correct examples and observable acceptance to layout/streaming/copy ownership.
  The fixed source map distinguishes direct local reuse from outside behavior or
  visual reference and records MIT attribution and provenance limitations.

## Verification

- PASS: `node --import tsx --test src/features/chat/components/learning-help.test.ts`
  checks exact attempt retention, empty input, independent next-step request and
  absence of effort/mastery instruction fields.
- PASS: focused Biome lint on all changed product TS/TSX files and learning
  fixture/test (no fixes).
- PASS: `npm run typecheck` after restoring the tiny tracked sparse
  `third_party/assistant-ui/streaming-text/upstream/utils` path. Initial run failed
  only because that import was absent and produced an implicit-any cascade.
- Existing broad `tsc -p e2e/tsconfig.json --noEmit` FAILED in unrelated
  `e2e/react-delivery/recovery.e2e.ts` browser.evaluate JsonValue typing and existing
  missing `@/` path mappings in imported harness files. It reported no error in
  the new learning test. This is not reported as a passed E2E typecheck.
- Browser scenario: pending serialized slot. Production GenUiCard/page/SDK,
  official resizable primitive and local synthetic topology API will exercise
  saved judgment, setting changes/original preview, host question/cancel,
  gesture rejection and next-version reference roundtrip. The second authored
  version is a deterministic fixture input; it does not prove provider-generated
  revision, real homework submission, server ACL or student mastery.

## Cross-owner actual outcomes

Source work reported by ux_visual: comfortable/compact tokens; composition guard
uses native isComposing/229/editor state and same-task composition end protection;
viewport retains official auto-follow with selection/disclosure pause and quote
jump staging. Their focused composition regression, existing message/presentation
and latency fake-clock checks passed. Browser environment and final evidence
remain owned by that contributor until supplied.

Source work reported by ux_state: six allowlisted business approval previews;
separate grant/execution/failed/unknown receipts; loaded durable run status drives
conversation labels; bounded scoped composer/uploaded-key/questionnaire draft
cache; existing-run refresh and effect-verification guidance. New approval,
draft/status and existing recovery checks passed. No actual tool produces nonempty
approval options; LingxiOS3.8.11 accepts boolean approval decisions only, so
historical unsupported options remain explicit. Browser acceptance is pending
that contributor's evidence.

## Remaining boundaries and rollback

The root integrator must rerun affected checks on the combined commit and obtain
independent final review. Native real OS CJK input, full light/dark/narrow visual
coverage, selection/history/scroll paths, actual before/after paint metrics,
real server tenancy/revocation/idempotency, model generation, homework submission
and production deployment are not established by the learning fixture.

Rollback is the local commit revert: no schema, dependency lock, protocol, runtime
provider, authorization or production change accompanies this workstream. The new
GenUiPage facade is internal to this frontend and delegates to the existing
bridge. Keep sibling-owned fixes when reverting a combined release.
