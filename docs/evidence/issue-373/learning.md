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
  through a thin page facade and retained-owner forwarding. Cancel/reopen, refresh and
  unconfirmed send use the existing bounded V2 cache in the artifact-question
  namespace, keyed by actual account/company/course/conversation/source/path.
  Accepted send clears only that question. Restored text prompts checking the
  original receipt before an explicit send; it is never automatically replayed.
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
- PASS: `context.test.ts` uses the actual installed AppBridge to reproduce the
  partial-state counterexample (48 remains after original request), then checks
  complete notifications preserve the preview and restore32. The guest projection
  is a bounded reproduction of the pinned consumer behavior; browser validation
  of this fix subsequently passed in the scoped topology replay below.
- PASS: `artifact-question-draft.test.ts` exercises the real V2 cache with
  account/company/course/conversation/source/path/logout isolation and scoped
  clearing. It was added before the scope helper (first run failed on the absent
  module); the implementation then passed.
- PASS: focused Biome lint on all changed product TS/TSX files and learning
  fixture/test (no fixes).
- PASS: `npm run typecheck` after restoring the tiny tracked sparse
  `third_party/assistant-ui/streaming-text/upstream/utils` path. Initial run failed
  only because that import was absent and produced an implicit-any cascade.
- PASS: focused E2E/config TypeScript check:
  `tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --lib es2022,dom,dom.iterable --types node e2e.learning.config.ts e2e/visualize/learning.e2e.ts`.
- PASS: bounded discovery smoke followed AGENTS → assistant-ui Skill → learning
  guide → GenUiCard sendFollowUp owner. This is a source/link check by the
  implementing agent, not an independent agent replay or a cost benchmark.
- Existing broad `tsc -p e2e/tsconfig.json --noEmit` FAILED in unrelated
  `e2e/react-delivery/recovery.e2e.ts` browser.evaluate JsonValue typing and existing
  missing `@/` path mappings in imported harness files. It reported no error in
  the new learning test. This is not reported as a passed E2E typecheck.
- Official browser run `01a16c67-09b2-744e-8e81-833ba1be25dd`: the
  artifact-question draft scenario PASS (28.25s), using the real card and cache:
  refresh restoration, actual auth-account switch isolation, no automatic send,
  and confirmed receipt clearing. The sibling state cache was present for this run.
- Topology final attempt `01a16c6c-98a1-74ee-b6fe-beec46bfa258` FAILED (21.63s):
  real native guest Save32, host help append, keyboard resize and changed Save48
  passed. The failure screen proves the original-settings button was pressed;
  the guest/receipt still held48 where32 was expected. Root cause: official
  `AppBridge.setHostContext` emits only changed fields, while the pinned GenUI
  guest treats absent annotation in a notification asnull. A state-only ACK
  therefore clears the active Tweak override; author state restore writes48,
  and later empty original-preview changes have no old override to roll back.
  `publishGenUiContext` now uses the public SDK complete-context notification in
  this isolated adapter. Initial handshake context, guest runtime, CSP and
  server boundaries remain unchanged. A provisional fixture-only hydration
  workaround was withdrawn rather than masking this product compatibility bug.
  Root ended that serialized slot and passed CDP9337 to cover_ui. Following the
  independently reviewed source fix and root disk recovery, the single scheduled
  topology replay passed as recorded next; this failed run remains historical
  evidence of the original defect.
- Browser failure history is retained: output outside project root was rejected
  before execution; resource root was missing from app.command.env (HTTP500,
  corrected explicit forwarding); nested opaque srcdoc frameLocator returned no
  nodes over existing Chrome153 despite ready SDK/rendered diagram. Both role and
  CSS nested locators were attempted; the final attempt used official native
  mouse input on a fixed synthetic Save control with real guest SDK receipts.
  The sandbox/CSP and source checks were unchanged. Failure reports and the
  observed final failure screenshot are adjacent to this document.
- Official reviewed topology run `01a16c7d-235c-77dd-9d84-a8ff2c1cc48b`
  PASS1/1 in15.97s (19.48s total, startup1.88s), source94d93199. Actual guest SDK
  saves followed32→48→original32→current48; the keyboard separator changed40→45.
  Accepted unchanged tweaks stayed disabled after panel toggle and expansion.
  Cancel/reopen retained the editable question; inline/expanded opener focus
  returned; expired browser activation plus synthetic click sent nothing, while
  the real click sent once. The authored next-version reference opened and prior
  state survived return. Evidence: six actual SDK state saves, exactly two
  follow-ups (design changes and the student's hint request), one final screenshot.
  Passing report/screenshot are retained beside the earlier failed artifacts.
- After that browser run, a two-line presentation correction places the question
  receipt in the currently visible inline/expanded host (one status at a time),
  so an expanded preview cannot obscure the inline receipt. Focused lint/source
  inspection covers that rendering-only delta; no extra browser run was added.
  The request/state/security behavior remains the independently reviewed94d93199.
- Synthetic API and authored second-version input do not prove provider-generated
  revision, real homework submission, real server ACL/idempotency or mastery.

Reproduction (Node22 on PATH; installed browser already running):

```sh
E2E_TELEMETRY_DISABLED=1 E2E_CDP_URL=http://127.0.0.1:9337 \
E2E_VISUALIZE_ASSET_ROOT=/workspace/issue342-visualize/third_party/zcode/skills/visualize/assets \
E2E_VISUALIZE_RUNTIME_ROOT=/workspace/issue342-visualize/server/assets/visualize-runtime \
node node_modules/e2e/dist/cli/bin.js run --config e2e.learning.config.ts
```

Full checkouts use the default tracked asset paths instead of those optional
read-only local roots. The config passes these values explicitly to the app
command, keeps its output inside the project, and disables video/trace.

## Final source checks and review

Independently reviewed/browser-verified source head:
`94d93199b1b469cff6a0dc135d772ec37de69f55`.
Learning-owned source commits are `266b38b3`, `2524c091`, `3d97049e`,
`94d93199`. The SDK
notification return is `void | Promise<void>`; an initial direct `.catch` caused
a real typecheck failure on2524c091. The final helper normalizes both sync/async
results and catches synchronous notification failure; its regression passed again.
The intermediate3d97049e full web+node typecheck passed. Independent ux_visual
review then found P2 local TweakPanel receipt ownership: expand/toggle remounted
local busy/accepted state and could issue an unchanged second follow-up. The
receipt now belongs to the retained page snapshot, keyed by current values;
pending/accepted/unconfirmed state survives panel movement and retained-owner
reacquisition. Same accepted values are a core no-op, and a real value change
clears the accepted stamp. Its remount regression failed before and passed after.
Review also identified SDK internal context-cache/default display-mode drift.
The pinned guest has no mode-request consumer; an explicit public handler now
returns the authoritative current host mode without granting a guest mode change.
The actual SDK callback regression passes. Each new page still constructs its own
bridge with the current initial handshake context.
Five focused learning/cache/context/mode/receipt regressions PASS. Full94d93199
`npm run typecheck` PASS, focused E2E/config TypeScript PASS, and owning lint PASS.
Independent ux_visual follow-up review closed P2/P3 with no remaining P1/P2.
The low-priority same-transport repeated SDK-initialize/cache path has no pinned
guest consumer and remains a documented boundary; ordinary new pages construct
new bridges. No broader provider/browser/deployment claim follows these checks.

## Explicit test dependencies

Root authorized local cherry-picks of ux_state `4cc6bccc` and `2ad2b1be`
(scoped cache + artifact-question namespace). They appear locally as `b49e9310`
and `94673515`; root integrates the original state commits first and only the
learning-owned commits from this branch. Do not apply those dependency patches
twice.

## Cross-owner actual outcomes

Visual owner final head `14c941eef88c4a85e69a13d2350f859da5980c66`:
33 focused checks, typechecks/lint and official before/after synthetic browser
scenarios passed; evidence is `docs/evidence/issue-373/visual-input/README.md`.
Baseline229 sent once, guarded229 sent zero; normal Enter/ShiftEnter/menu/Esc,
original body-node identity, selected text, semantic focus/selection and reduced
motion were observed. Selected text shifted16px under native anchoring, less
than the27.2px body line; the zero-drift global-anchor experiment was reverted.
Warm dev first-body samples152.0ms before/110.9ms after (one/two paint samples)
do not establish a causal performance improvement. Physical IME, other engines,
async-height/pagination and settled dark-color captures remain limits.

Source work reported by ux_state: six allowlisted business approval previews;
separate grant/execution/failed/unknown receipts; loaded durable run status drives
conversation labels; bounded scoped composer/uploaded-key/questionnaire draft
cache; existing-run refresh and effect-verification guidance. New approval,
draft/status and existing recovery checks passed. No actual tool produces nonempty
approval options; LingxiOS3.8.11 accepts boolean approval decisions only, so
historical unsupported options remain explicit. Browser acceptance is pending
that contributor's evidence.

## Remaining boundaries and rollback

The root integrator retains combined release CI/build and the final rendering-only
receipt review. Independent source review and the scoped topology replay are now
complete; the state workstream's separate browser/release checks remain its own
acceptance boundary. Native real OS CJK input, full light/dark/narrow visual
coverage, selection/history/scroll paths, actual before/after paint metrics,
real server tenancy/revocation/idempotency, model generation, homework submission
and production deployment are not established by the learning fixture.

Rollback is the local commit revert: no schema, dependency lock, protocol, runtime
provider, authorization or production change accompanies this workstream. The new
GenUiPage facade is internal to this frontend and delegates to the existing
bridge. Keep sibling-owned fixes when reverting a combined release.
