# #670 — Visualize retirement and semantic Design explanations

Draft PR: https://github.com/LingXi-Org/LingxiLoop/pull/672

Branch `issue/670-design-explanations` began at `91f0ba03`, integrated
`8cc00fd8` (#682/product62), then `8102eb43` (current main at final qualification).
The first merge resolved four shared CI/Docker conflicts by preserving both
case and Visualize retirement and both integration owner mappings. The second
merge was clean. No migration, runtime patch or dependency version upgrade is
introduced relative to current main. #663 remains the user's independent work.

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

The model first makes one native semantic decision with
`design.plan_explanation {delivery: canvas|text|other}`. There is no host keyword
classifier. Greetings, simple facts and explicit text-only requests stay text.
The first confirmed decision controls bounded prerequisites and cannot be
replaced by a later planning call; the planner leaves the catalog after its
first attempt. A canvas decision requests at most one exact current
`claude-design` load. An initially text decision can still voluntarily use
Design, so final qualification measures actual tools, saved files and delivery,
not only the advisory initial label.

The receipt-driven sequence reads the format and current canvas, explicitly
initializes a cold canvas through authorized `design.ensure`, reads actual
listed files and tokens, writes and checks. Reference reads are bounded at two,
file reads at four and automatic checker repairs at three writes. Failed stages
stop forced selection. Native truncated reads require a ledger-derived
observation reference; preview text never proves completion. Dynamic exact
arguments remain data observations, rather than trusted policy instructions.

Delivery requires a latest confirmed save, a subsequent zero-problem check and,
for a canvas plan, actual retained authored content. Successful deletes/empty
overwrite remove prior proof. `design.check` accepts at most32 authored paths
and reports only those present, nonempty and indexed in the exact checker
snapshot. An empty index, old unrelated board or newly unreferenced file cannot
prove the explanation. Default checks and Slides remain compatible. Until this
proof exists, streaming rejects unsupported completion claims before any public
delta/seal; truthful fallback starts with the explicit incomplete notice.
Cancellation, revocation and failed saves retain existing human work.

Maintained teacher presets add an explicit Design method set through the
existing provisioning owner. Live course/room/teacher/audience checks remain;
teachers cannot start workspaces. Revoked or custom missing grants are not
inferred from skill selection. Learning guidance preserves frozen requirements,
student authorship and the distinction between explanation and learning proof.

## Verification

Managed Linux, Node22.22.0, exact published LingxiOS3.8.24. Existing configured
package/model authentication was reused without exposing credentials. New
isolated local databases use the official formal bootstrap and product62;
production and pre-existing developer/test databases were not altered.

- Web smoke166/166; typecheck and production build. Archive focus regression7/7.
- Final source server193/193, server typecheck/lint; independent policy and
  retained-board proof19/19. Independent retirement review10/10.
- Build/CI/Worker/scoped-dependency contracts52/52; retained Design/Slides/math
  contracts43/43 and independent Design build, before the last main merge. After that merge, the expanded retained
  Design/Slides/math suite passed52/52 on Node22 and standalone Design build
  passed. The final two-line semantic default also passed typecheck/lint,
  policy/tool/check19/19 and native normal/failure3/3.
- Product62 native batch20/20: normal delivery2, failed-CAS truthful
  fallback1, streaming/rejection4, archive/teacher5, editor boundary8. The failure
  regression proves zero temporary false public deltas/seals, useful incomplete
  text delivered and original files retained.
- After latest main8102eb43: both typechecks/lint passed; native combined23/23
  including first-action, failed-CAS, streaming, archive/teacher, editor and new
  native correction. Independent incremental review20/20, no new P1/P2.
- Current teacher5, current runtime/product54 CAS5 and actual archived3.8.2
  migration37:47/47, no skips. The four frozen historical display files and all
  immutable SQL remain unchanged. A pinned inert test-only dependency resolves
  an archived import without restoring product rendering.
- Initial CI41837165228 component checks passed, but historical integration
  found a current-preset7 versus immutable-preset6 assertion; fixed the test.
  Main-integrated CI41842877835 passed all jobs on d5c2d5da. Later607a90dd run
  41846138974 passed component checks and the integration test step, but the
  integration job ended cancelled at12m29 after the steps completed; it is
  not a green final run. Its timeline showed standalone Design build followed
  by the same complete build inside design-editor.test. The final CI removes
  that redundant prebuild, retains all editor/math tests and their owning builds,
  and keeps the existing12-minute job limit. Build/CI/Worker contracts again
  passed52/52. Final exact-head CI remains the merge gate.
- Independent source reviews607a90dd and2c421ef4 found no remaining P1/P2 after cold-start,
  failed-save, planning override and deleted/unindexed-board fixes. No PR
  Approve was submitted.

### Browser evidence and boundaries

`archive-browser/result.json` exercises actual AnswerText and HTTP client with
trusted keyboard JSON download, duplicate-send prevention and403 body/focus
retention. No automatic export or old runtime. Its identity/HTTP are synthetic;
current ACL and user-state isolation are covered separately in native DB tests.

`model-snapshot-browser/result.json` replays the real saved
`one-shot-introduction` source through actual AnswerText, DesignWorkspace and
compiled editor: native open/edit/CAS save/refresh/reopen,12 formulas retained.
`design-math/result.json` exercises eight formulas, keyboard editing, CAS save,
reopen and narrow-screen focus. The final main-integrated replay in `final-model-browser/result.json` repeats
open/edit/save/reopen with all12 formulas. Its fixture reconstructs exact
authorized snapshot paths from the retained native file manifest and verifies
sha256, including nested token paths. These use local grant/HTTP/CAS fixtures; they do
not claim production authentication, browser export or model generation.
Reproduce with `node scripts/check-retired-visualize.mjs`,
`node scripts/check-design-snapshot.mjs` and `node scripts/check-design-math.mjs`
after `npm run build:design-editor`. The snapshot script accepts input/output
directories and retains the original public fixture files.

### Real-model matrix and retained failures

Actual native product Worker/tools, isolated PostgreSQL, recorded local IM,
DeepSeek-V4.1-Flash through the configured provider. All questions and generated
artifacts are public synthetic fixtures. Diagnostic catalogs/schema metadata
contain no credentials or private prompts. Clean qualification requires no
failed tools, provider/model attempts, protocol or budget errors, plus actual
saved/check0 output for canvas cases and no canvas writes for text cases.

The final isolated budget is root64 calls, Worker24 calls/480seconds,
test540seconds/runner600seconds. Earlier runs inherited a local root cap12 even
with Worker24; their budget failures remain recorded. Production budgets,
credentials, retries and ordinary CI timing were not changed. Node's inherited
environment proxy requires `NODE_USE_ENV_PROXY=1`.

| Case | Evidence directory | Observed result |
| --- | --- | --- |
| Broad introduction without canvas keywords | final-observed-introduction | Clean success, actual canvas/check0,92578ms |
| Process/mechanism without canvas keywords | final64-process | Clean success, actual canvas/check0,99612ms |
| Comparison/tradeoffs without canvas keywords | semantic-default-comparison | Clean canvas decision, saved/check0 success,92537ms |
| Explicit Design request | final64-explicit | Clean success, actual canvas/check0,98804ms |
| Greeting | semantic-default-greeting | Clean text, no artifact,7417ms |
| Simple fact | semantic-default-fact | Clean text, no artifact,13640ms |
| Explicit text-only | semantic-default-textOnly | Clean text, no artifact,22278ms |

All attempted runs remain in their named directories, including unsuccessful
ones; no failed evidence is rewritten as accepted. `introduction-network-failure`
omitted the proxy switch. Prompt-only `final-introduction` selected text and
motivated explicit semantic planning; `semantic-introduction` created three
boards but repeated the planner. `one-shot-process` had an invalid write and a
false partial claim, motivating the streaming completion gate. `delivery-*`,
`native-*` and `qualified-*` retain the evolving implementation and root12
calibration failures; some useful text responses were not clean qualification.

On final source607a90dd, `final64-comparison` actually succeeded, saved a canvas
and check0 without provider/protocol/tool errors, but its old test failed an
overstrict initial planner-enum assertion (text followed by voluntary Design).
The committed test correction records the initial label separately and judges
actual tools/files. Its original failed result is preserved. The next
`final-observed-comparison` failed at the upstream provider after saving, with
no false success claim. `final-qualified-comparison` likewise timed out in a
provider write stream with incomplete JSON, before a board was saved. These
are failed qualification attempts. `final-repeat-comparison` then delivered
text only (plan=text, no canvas) despite its multiple comparison dimensions.
That concrete failure tightened the semantic default in both tool description
and product guidance: multi-dimensional explanations use canvas, with prose or
Markdown tables as companion text. This adds no host keyword classification,
new authority or retries. Independent incremental review found the two-line change appropriate. Focused
policy/tool/check tests19/19 and fresh negative checks all passed using the updated
guidance (`semantic-default-greeting`, `semantic-default-fact`,
`semantic-default-textOnly`). The corrected comparison then passed cleanly in
92537ms, planned canvas, saved the actual comparison artboard, checked0 and
gave its title and current conversation Design location in the final reply.
Its diagnostics and complete public generated source are retained in
`semantic-default-comparison`. `final64-introduction` also retains a provider protocol
failure before its later clean retry. This matrix demonstrates tested behavior,
not a measured provider reliability rate or speed improvement.

## Release handoff

Only the parent's designated sole integrator task
`01a19a90-dfc4-77f7-9803-e9035c481026` merges and releases. Main deploys after CI;
there must be one production writer. No #670 merge/deploy or dual-host health
claim is made by this development branch.

The SDK harness hash changes. Before rollout, inspect and drain affected
nonterminal old-pinned runs under the old deployment, or explicitly stop them
while preserving body, receipts and artifacts. `docs/visualize.md` includes the
paginated read-only inventory. A native restart regression confirms old pins
are rejected; never bypass the hash or imply legacy interaction was delivered.
Existing persisted obligations resolve honestly as unsupported/partial only.

Main #682 adds product62. Local isolated61→62 applied only0062; fresh official
bootstrap and repeated migrate/no-op also passed. After62, an exact61 deployment
is not a valid rollback: use a known compatible62 commit and the integrator's
current production state. Durable historical rows are preserved. Before merge,
recheck main, exact-head CI and independent final review; after deployment,
verify both hosts and public readiness using the existing release owner.
The final candidate CI URL and exact SHA are recorded in the PR check suite.
A queued or cancelled check does not authorize reporting a completed release.


## Main reconciliation after #691

The next integration baseline is main `ab31390b` (merged uploads, homework
reports and grounded teaching actions), following the previously qualified
candidate `ffe1ee98`. Three conflicts were resolved in CI, the server Dockerfile
and runtime context. Both SPA/runtime packaging retain `shared/upload-mime.ts`
and runtime includes `src/lib/uploadError.ts`; Docker context allowlists and CI
ownership retain the upload additions. Removed Visualize entries remain removed.
The editor tests still own their complete prerequisite builds.

Teaching context creation, grounded task rules, scaffold planning, final-answer
checks and the separately budgeted authorized homework teaching item are retained.
The single composed publication hook first preserves the shared global gate's
reject/approval decision, then applies Design completion constraints and teaching
withholding. None can clear a previous rejection or approve past the shared gate.
Design prerequisite snapshots are computed only for an actual canvas decision;
ordinary teaching context retains its supported minimal observation path.

Local owning verification:29/29 policy/tool/teaching-context tests,52/52 image
packaging/CI/Worker/scoped-dependency contracts, server typecheck/lint,21/21 native
Worker/archive/editor/teaching regressions. The combined test covers premature
Design claims, truthful-but-incomplete teaching fallback, valid final fallback,
and preservation of a global rejection. Native teaching still explicitly records
formal3.8.24's fail-closed publication behavior, not an invented correction.

PR#688's owner is separately fixing the global publication gate and formal3.8.25
bridge. This reconciliation does not modify `public-text-safety.ts`, upgrade the
SDK, alter product62 migrations or bypass old harness pins. Final integration
with that future head needs its own validation. Earlier real-model/browser
matrices qualify their recorded source; this merge does not claim a fresh live
model or production test of the combined teaching/Design path. The new head
requires its own CI; the older green run41851272650 is historical evidence only.
No production, admission or old-run termination action is performed in this
reconciliation; the designated integrator retains the #691 recovery and release.
