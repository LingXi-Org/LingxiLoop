# Source-grounded HTML presentations

LingxiLoop has one presentation domain and still has one Agent Runtime. A model
uses the typed `host.presentations.*` Host Bridge from `ipython`; `ipython`
remains the only model-visible tool. Presentation work is asynchronous and is
owned by the existing PostgreSQL lease/fence Worker pattern.

## Generation contract

The default target is 24–36 pages, with a hard limit of 40. The Worker snapshots
at most 40 authorized, enabled and ready project Sources, then obtains bounded
`PresentationMaterialV1` records from Open Notebook. Full Notebooks are never
placed into a prompt. Instead, immutable `EvidenceItemV1` rows retain local
Source, chunk, optional page/section, a bounded excerpt and an auditable claim.

Generation is checkpointed as research/evidence, `DeckPlanV1`, outline review,
per-page `SlideSpecV1`, deterministic validation, whole-deck critic, at most two
targeted repairs, deterministic rendering and immutable publication. A failed
page is never skipped. If the evidence cannot support the requested length, the
presentation enters `needsAttention` with a reliable recommended page count;
the user must explicitly accept that shorter target or add Sources.

The state machine is:

`waitingForSources → planning → awaitingOutlineApproval → generating → validating → ready`

`needsAttention`, `failed` and `cancelled` are terminal attention states until
an authorized retry or revision creates a new job.

## Security and rendering

Models emit only versioned JSON specs. They never emit HTML, CSS or JavaScript.
The deterministic compiler produces fixed 1280×720 slides, one conclusion and
one main visual per content page, 2–4 protected zoom targets, local source
markers and a source index before the closing page. The trusted camera/runtime
is pinned to the provenance in `third_party/interactive-lecture-deck` and is the
only executable code in the artifact; slide iframes contain no scripts.

Text and attributes are escaped, finite visual grammars are allowlisted, and
source images must be bounded data URIs. The self-contained HTML uses a
hash-based CSP that forbids networking, forms, objects and popups. The preview
iframe uses exactly `sandbox="allow-scripts"` without `allow-same-origin`.
Artifacts over 25 MiB are not published.

No real Chromium process is installed or launched by presentation generation.
Publication uses deterministic schema, citation, CSP, DOM-contract and geometry
invariant checks; runtime behavior is covered by contract tests.

## Authorization and delivery

Project-only inputs create a project-visible artifact card. If any input Source
is private, the entire presentation is private to its author and the group chat
does not receive its title or contents. A private version cannot be promoted by
changing metadata; it must be regenerated from project-only Sources.

Artifact messages carry only `artifactId`, `artifactKind` and title. The Drawer
loads status and authorized version bytes from the presentation API, provides
outline approval with an expected revision, then supports playback, versions
and byte-identical HTML download. Internal evidence, plans and quality reports
remain server-side audit data.
