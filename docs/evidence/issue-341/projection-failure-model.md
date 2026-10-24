# Answer revision projection failure model

Written before implementation; all test text and identities are synthetic.

- A superseded answer is reclassified as ordinary progress, repeating draft text in both the expanded activity and latest progress summary.
- A committed answer's accepted source repeats the delivered body when its history page is loaded.
- Revision treatment accidentally swallows actual commentary, repeated wording in another message, or real failed tool calls.
- The first streamed answer disappears during the accepted-event/committed-message gap, or a partial/cancelled/failed answer is hidden as an obsolete draft.
- Replay or reconnect creates duplicate revision identities, reopens collapsed transcripts, or loses a revision from a bounded history page.
- Copy answer includes an archived revision; archived renderer references become live.

Checks: real RunStreamProjection transitions, strict native wire/history parsing, and the official @e2e-dev/web browser using the existing isolated AssistantTransport/store/conversation fixture. Preserve full revision text behind an explicit labelled disclosure; keep real failure/call entries and public commentary in their existing locations.

Additional replay failure identified before the stable-identity correction: a delayed page from the older projection can carry the current candidate as ordinary commentary. If supersession renames the live identity, page merging may retain both the stale prose and the revision transcript. Preserve the existing public-text identity across this transition; exercise the real transport/store/history merge while that page is held in flight.

Additional audit failure: keeping a cancelled/revoked partial answer in the body must not remove its source from the history endpoint. Preserve the original source identity and use the explicit current-fragment transcript label in history. Existing real Worker/SSE integration assertions retain that audit requirement.
