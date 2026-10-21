# Repair answer projection (#262)

Written before implementation. Public text is an immutable event archive, not
an instruction to show every abandoned answer as another foreground answer.

- Replaying the same event must not append it twice (native seq/part/chunk IDs).
- Equal text from distinct tool-bearing attempts is legitimate progress and
  must remain visible. No textual similarity or length heuristic is permitted.
- A superseded no-tool candidate must move out of the foreground while remaining
  in authorized activity history. An interrupted tool preamble must remain.
- A new provider prefix must appear immediately, before EOF or final commit.
- Native `model.delta` repeats the complete final candidate after its public
  segment ends; do not show that additional preview beside the streamed source.
- Committed acceptance is associated only by native acceptedResultId. Archiving
  an abandoned candidate does not imply it was accepted or that a task succeeded.
- Snapshot history counts and page cursors must include archived candidates.
