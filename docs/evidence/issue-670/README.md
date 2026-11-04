# #670 — Visualize retirement and semantic Design explanations

Baseline: `91f0ba03` (`origin/main`, 2026-11-04). Isolated branch:
`issue/670-design-explanations`. Scope is issue #670 only; #663 remains the
user's independent work. Related #582/#605/#606/#613/#652 are not closed by
retiring their former consumers.

## Consumer inventory and resulting ownership

| Consumer | Result / retained owner |
| --- | --- |
| Chat `VisualizeText`, `::visualize`, GenUI host/guest/MCP bridge, tweaks, state, follow-up, CSS | Runtime/frontend tree removed. `AnswerText` preserves original body/source offsets; `ArchivedVisualizeReferences` displays an inert recovery action. |
| Directive/reference parsing consumed outside GenUI | Passive bounded parser in `shared/assistant-directive-parser.ts` and `shared/retired-visualize.ts`; Apache license/source notice retained in `third_party/visualize-compat` and static distribution. |
| System skill, `visualize.*`, delivery/review/projection/export/context hooks | Active registrations and implementations removed. Generic skill loading, native authorization, observation and LLM ledger remain. `retired-capabilities.ts` handles only already persisted obligations, never new activation. |
| Old pages, state writes, gestures, follow-up, open-external, runtime/static URLs | Former API routes return 410 under current caller authorization. Backend and static Worker reject old runtime/assets, including stored hashed asset URLs. No old document HTML is mounted or executed. |
| Historical documents/state/pages/gestures | Immutable migrations and all durable rows retained. Authorized archive verifies the original complete delivered message, current conversation/project/tenant access, exact reference and source; exports source, the caller's state and non-secret page metadata as JSON attachment. Token hashes and other users' state are excluded. |
| Previously accepted follow-up with uncertain acknowledgement | Only an identical already committed acceptance can replay; no new old follow-up is admitted. Body and accepted request identity remain intact. |
| ZCode vendor code, build, fixtures, optional scripts, verification and CI inputs | Exclusive sources/assets/dependencies removed. Historical evidence stays archived; runnable obsolete perf entrypoints removed or reduced to retained Design consumers. |
| `build-artifact-math` consumed by Design | Removed only its `visualize-runtime/math.js` side effect. Design owns hashed online/offline KaTeX assets; shared native math source, fonts, CSP and Slides remain covered. |
| Docker / static Worker / dev / release | Design has its own build entry. Docker retains all transitive Design inputs. No Visualize resource production entry remains; source/static distribution retains passive parser attribution. |
| Historical migration display fixture | Four byte-frozen display snapshots remain unchanged. The fixture receives one explicitly pinned inert text-only dependency for its archived import; no retired product projection/renderer is restored. |

## New Design path

An ordinary authorized turn first makes one native read decision,
`design.plan_explanation {delivery: canvas|text|other}`. The model evaluates
meaning and complexity, not a host keyword list. Greetings, direct facts,
explicit text-only requests and other requested deliverables retain their
appropriate response surface. The first confirmed current-request decision is
binding; the planner leaves the exposed catalog after its first attempt.
A canvas decision requests at most one exact current `claude-design` load;
failed/wrong selections never create a policy-forced load loop. The existing
skill name is retained and its version/hash advances, so historical loads
cannot unlock current guidance.

After guidance a bounded native prerequisite sequence follows confirmed receipts:
read format, `design.current`, initialize if null, read the listed canvas index and
listed design tokens, write and check. Failed stages stop forced selection;
wrong reference reads are bounded at2, file reads at4 and automatic checker
repairs at3 writes. Native-truncated reads require a ledger-derived observation
reference, never preview text, to establish completion.

After guidance: read format and `design.current`; if no canvas exists, the
explicit authorized `design.ensure` transaction initializes/reuses the one
conversation canvas and returns actual files. Read current sha256s, preserve
existing human work, save complete artboards and their index, then check.
Satisfied completion requires a confirmed latest save and a subsequent
successful zero-problem check; a canvas explanation also requires a positive
board count, so an empty index cannot qualify. Failed/unknown saves cannot use an old canvas
check as proof. Canvas plans with no content write cannot declare satisfaction.
Cancellation and genuine permission/tool failures retain partial content and
must be reported truthfully.

Maintained teacher presets add Design through the existing provisioning owner;
both context and native action authorization share an explicit method set.
Teachers retain live course/room/teacher/audience checks and cannot start
artifact workspaces. Learning/homework instructions retain frozen requirements,
student authorship and the distinction between generated explanation and
learning evidence. Revoked/custom missing capabilities are never inferred from
a skill selection.

## Verification record

Environment: managed Linux, Node 22.22.0, exact published LingxiOS 3.8.24.
Dependency install used existing configured authentication. New isolated local
`issue670_test` was prepared by the existing formal version bootstrap;
production and the pre-existing developer/test databases were not altered.
No migration or credential/security-setting change is part of this PR.

Completed before final candidate:

- Web smoke: 166/166; web typecheck and production build.
- Server smoke after planner introduction: 189/189; server typecheck.
- Build/CI/Worker/dependency contracts: 50/50; retained Design/Slides/math
  contracts: 43/43; CI ownership regression: 8/8.
- Native first-action synthetic integration: 2/2, including deliberately
  truncated/recovered output which is correctly not qualified as a clean run.
- Archive HTTP/current ACL/tenant-project/user-state/revocation, former routes,
  committed-only echo and teacher method authorization: 5/5.
- Independent read-only retirement review: 10 tests passed. Design reviewers
  identified cold-start, failed-save and later-plan override gaps; all received
  focused fixes and regressions. No PR approval was submitted.
- `archive-browser/result.json`: actual AnswerText/HTTP client and trusted
  keyboard JSON download, no automatic export or old runtime, duplicate-send
  guard and403 body/focus retention. Synthetic identity/HTTP fixture; real ACL
  coverage is the separate database integration.
- `model-snapshot-browser/result.json`: actual saved model source, AnswerText and
  DesignWorkspace, trusted open/edit/CAS save, refresh/reopen,12 formulas intact.
  Synthetic grant/CAS fixture; model generation and current authorization are
  established by separate native/database evidence.
- `design-math/result.json` and `reopened.png`: real compiled editor in Chromium
  CDP, 8 formulas, native keyboard edit, one CAS save, reopen, narrow keyboard
  focus. Fixture HTTP/CAS, not production authentication or browser export.

### Real-model attempts and limits

All samples use public synthetic questions and the actual native product
Worker/tools, a dedicated PostgreSQL database, recorded local IM delivery and
DeepSeek-V4.1-Flash via the configured provider. Diagnostic files contain
catalog/schema metadata and public generated fixture artifacts; no private
prompts or credentials are recorded.

- `introduction-network-failure`: first attempt omitted Node's environment
  proxy switch; provider network failures, no tool call. Not accepted.
- `introduction`: prompt-only semantic selection successfully created a cold
  canvas and checked it; this preceded the final transactional ensure fix.
- `final-introduction`: prompt-only repeat chose text and no canvas; not
  accepted. This concrete failure motivated explicit semantic planning.
- `semantic-introduction`: generated and checked three actual artboards and
  gave the user their names and Design location, but called the planner twice.
  Overall test failed its one-shot assertion, even though that earlier file's
  narrower `accepted` field described saved artifact delivery. The final metric
  also requires exact one-shot routing. This attempt motivated hiding the
  planner after its first attempt and binding the first confirmed decision.
- `one-shot-introduction` passed on the one-shot routing implementation.
  `one-shot-process` correctly routed to Design but had a provider protocol error
  and an invalid write; its final partial body incorrectly claimed a ready board.
  This concrete failure motivated the final streaming/answer delivery gate.
- The final native failed-CAS regression now rejects unsupported text inside
  streaming generation, before a false public delta or seal exists, then
  delivers the exact incomplete notice plus useful text. Normal Design2/2 and
  native suspension/rejection4/4 also pass. This corrects the earlier EOF-only
  hold, which had prevented tools/correction, and the later final-only check,
  which had allowed a transient rejected candidate before replacement.
- Final `delivery-*` matrix is still running; its first process run began before
  the last streaming gate and hit the finite240-second execution limit. No final
  acceptance or production success is claimed until actual results are recorded.

## Release boundary

Only the parent thread's designated sole integrator may merge/release. The
existing integration task is `01a19a90-dfc4-77f7-9803-e9035c481026`; do not
start a competing production writer. Main automatically deploys after CI.
The final candidate must be independently reviewed and green on exact-head CI.

The public SDK pins in-flight work to its immutable harness hash. This change
alters that hash; resuming an old run on the new worker is deliberately rejected.
Before rollout, the integrator must inspect and drain affected nonterminal work
under the pinned old deployment, or explicitly stop it while preserving its
body, receipt and artifacts. A new runtime must not bypass the hash or pretend
legacy interaction was delivered. Read-only inventory and observed restart
coverage belong in the recovery guide / final test record. Rollback is a known
compatible committed deployment, with all retained data preserved. An old
frontend's reappearance on rollback is a product-release decision, never an
automatic data conversion.

Draft PR: https://github.com/LingXi-Org/LingxiLoop/pull/672. Initial commit
`011ad011` passed all component CI checks; its historical integration failed a
current-preset7 versus immutable-historical6 assertion. The assertion was fixed
to the actual historical value without changing migration SQL. Official owning
recheck passed current teacher5, current-runtime/product54CAS5 and historical
3.8.2 migrations37; no skips.
Later delivery-gate/browser changes require their own final exact-head CI.

Real model qualification initially used a finite240-second Worker budget; one
process run hit that bound. The explicit opt-in single-file live qualification
now allows480 seconds per Worker /540 per test /600 per runner invocation.
Ordinary CI, product budgets, provider credentials and retries are unchanged.
This measures completion under a stated bounded budget, not a speed improvement.
No merge, production deployment or double-host health result is claimed here.


## Current integrated candidate

The branch now includes main `8cc00fd8` / PR#682 and its product62 migration.
Four shared CI/Docker conflicts were resolved by retaining both current case
retirement and Visualize retirement, with both integration owner mappings.
`#670` adds no migration, runtime-patch change or package version update relative
to that main. Local isolated product61→62 applied only0062 in77ms; separate
fresh qualification bootstrapped formal3.8.24/product61 and applied62/no-op.
The old exact61 deployment is not a valid rollback after62: use a compatible62
commit and the designated integrator's current rollout state.

A final review caught authored-then-deleted/unreferenced board delivery. The
current gate tracks effective successful .dc.html writes/edits minus later
deletes. Design.check accepts up to32 optional authored paths and returns only
those present, nonempty and indexed in the exact checker snapshot. Generic
checks and Slides keep their existing output. This avoids exporting an unbounded
old-canvas listing and prevents an old board from proving a new explanation.

Final local source checks: server193 tests,19 focused policy/proof tests,
server typecheck/lint; final product62 native/editor/archive batch20/20. Latest
main-integrated CI41842877835 on d5c2d5da passed all checks/integration; later
proof changes still need their own exact-head CI and independent review.

Public pre-release probes at2026-11-04 13:57 UTC returned backend readyz with
DB/Redis/control healthy and frontend HTTP200. This observes the existing
production release only: it does not establish that #670 or product62 deployed,
nor dual-host health. Main #682 CI41841662583 was still running at that read.

The first real matrices inherited a local root cap12 despite the Worker cap24;
several failures explicitly recorded budgetLimit/calls. A final isolated rerun
sets root cap64 with Worker cap24 and480-second wall limit, within the repository's
approved production root ceiling512. Production budgets and existing roots are
not modified. Zero-failure qualification remains strict; deliveredOutcome is
reported separately so recovered transport defects are not disguised as clean
runs, and useful correct text is distinguished from canvas delivery.
