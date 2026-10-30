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
passed in an isolated directory with the repository source and public packages
at the versions resolved by the repository lockfile (including React 19.2.8).
The managed environment could not install the exact private SDK: the registry
returned HTTP 401 for 3.8.17. Full type checks, SDK-backed tests and integration
remain pending; an unrun local check is not a pass. Independent read-only review
found one incorrect public-text test fixture enum/nullability, now corrected;
no further blocking finding was reported within this change. The skeleton SSR
checks cover reference/receipt and acquisition states, not a mounted browser
loading-to-ready interaction. No browser screenshots or live-model artwork
delivery are asserted here.

The historical protocol subreason is still unknown. Formal 3.8.17's prior
parser fixes and a synthetic failure fixture cannot establish that the original
private failure had that fixture's cause. Old #439/#515/#518/#560 remain under
separate acceptance and must not be closed merely because these tests pass.
