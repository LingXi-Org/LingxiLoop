# Issue 355: factual work categories in the waterfall

Failure model recorded before implementation:

- Rendering the entire trace below the single collapsible root named “运行” hides the existing real work types behind one generic row.
- Group headings must be presentation only: no invented span identities, parents, intervals, durations, token counts, costs, or completed states.
- A direct child belongs to exactly one category derived from its recorded kind/workKind. Its descendants stay under their recorded parent, even when their type differs from that parent.
- Concurrent spans, failed retries with distinct identities, cancellation, and unmeasured historical intervals must survive unchanged. Grouping must not merge similar labels or compute new accounting.
- Category filtering keeps needed ancestors. Explicit inspection must reveal the selected real child even after a different filter or collapsed ancestor. Routine replay must retain the user's expansion and scroll state.
- The real run aggregate remains inspectable independently and cannot collapse all work. Narrow layouts share one measured timeline axis without horizontal overflow.
- Existing public input/output allowlists remain unchanged. The view does not read raw tool arguments, private reasoning or credentials.
