# Failed-run history, retrieval status, and visualization loading

Scope: #578, #579, #580. Based on main `e7057fd7`, with the exact published
LingxiOS 3.8.17 dependency unchanged. The issue samples came from 3.8.16;
they do not establish another failure on 3.8.17. No private conversation was
replayed and no live model request was made for this change.

## Behavior

- Terminal IM receipts persist a small run/request/fence/feedback reference.
  Old receipts with run/request/feedback identity can also request the existing
  authorized run reader. No full descendant trace is copied into IM. The read
  validates the current feedback/version and rejects a substituted attempt.
  Existing conversation recovery remains the main route to the assistant trace;
  the terminal notice also supplies an explicit read/retry entry when recovery
  is unavailable. Unavailable or changed records are reported, never invented.
- All failed, unsealed v3 answer candidates become process summaries. Accepted
  or sealed sources and normal streaming append remain unchanged. The browser
  no longer resurrects session-only draft text over the durable projection.
  Full failed candidates remain in native events; protocol correction remains
  bounded by the official SDK. This does not rewrite native append into replace.
- Course-search status comes from actual `knowledge.search` tool receipts, not
  embeddings or missing citations. The display distinguishes not called,
  running, matched, no matches, no authorized sources, processing, unavailable
  and unknown. A stopped run cannot leave a pending search marked running.
  Context already loaded by a workflow is not claimed to be a tool invocation.
  Course-answer instructions request authorized search before falling back to
  general knowledge when supplied course evidence is insufficient.
- Inline visualization generation and actual artifact loading reuse existing
  skeleton primitives. Incomplete/invalid references and failed/offline loads
  retain their truthful state and existing recovery controls. A skeleton is
  not evidence of saved, authorized, verified or delivered artwork.

## Focused coverage and limits

Added regression cases cover exact terminal-reference binding, search receipts,
failed draft projection, fresh-history equivalence, and bounded native protocol
failure through worker/ledger/IM/recovery HTTP. Visualization tests cover loading,
terminal/incomplete/invalid references and existing card recovery states.

18 focused contract, localization, skeleton and trace-rendering assertions
passed initially in an isolated directory with public dependencies. Full local
web type checking and the affected skeleton SSR check now also pass against
the unchanged official lock and exact SDK 3.8.17.

The registry install returned HTTP 401 both initially and on the single later
retry: this environment did not bind the `NODE_AUTH_TOKEN` read by `.npmrc`.
No credential was substituted. The authorized GitHub publication artifact
`published-runtime-v3.8.17` (artifact 12956883660, release run 41007318648) was
then read. Its tarball SHA-512 matches registry.json, pack.json and the formal
Loop lock; SHA-1 matches both publication metadata files, and registry gitHead
is `16e793b39af73f01d10c6fc819b02dce84656236`. Offline installation from that
verified package and the existing cache succeeded without editing dependencies
or locks or substituting an SDK built from source.

[CI 41015217534](https://github.com/LingXi-Org/LingxiLoop/actions/runs/41015217534)
passed server lint/type checking/tests and 11 selected integration files,
including all seven runtime-chat-recovery cases. The new fail-all fixture
checks three bounded rejected attempts, no failed candidate body, terminal
receipt identity, recorded error timings/diagnostics and authorized HTTP replay;
wrong tenant/version/fence/feedback cannot substitute another trace. Web tests
also passed. That run found a duplicate-property UI test fixture and missing
CI ownership for the new shared helper, corrected here. The two affected image
import-graph/CI-routing checks, UI SSR check and full web type check passed
locally after correction; final PR CI remains the integration gate.

Independent read-only review found an incorrect public-text test fixture
enum/nullability, corrected before CI; no other blocking finding was reported
within that review. CI also caught and corrected the new helper's image COPY
and an outdated failed-draft expectation. The skeleton SSR checks cover
reference/receipt and acquisition states, not a mounted browser loading-to-ready
interaction. No browser screenshots or live-model artwork delivery are asserted.

The historical protocol subreason is still unknown. Formal 3.8.17's prior
parser fixes and a synthetic failure fixture cannot establish that the original
private failure had that fixture's cause. Old #439/#515/#518/#560 remain under
separate acceptance and must not be closed merely because these tests pass.
