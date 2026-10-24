# Example: retire an orphan view

At `190930ff`, `CheckpointHistory` remained in Web source after commit
`b97299cc` removed its import, tool registry and message converter. The current
UI has explicit registries and no directory discovery. Independent inspection
also checked Admin, Control, Electron and the tracked preview entrypoints.

The cleanup deletes only that 99-line / 2,993-byte view. `ProgressCard` remains
because it renders persisted tool activity; `AgentStatus` remains because a
tracked review page consumes it. Historical hash receipts remain historical.
This reduces source maintenance; no production bundle or latency saving is
claimed.

Replay the evidence at [issue-370/cleanup.md](../../../../docs/evidence/issue-370/cleanup.md),
including the consumer queries, retirement commit, owning checks and exact
restore command. See [the delivery record](../../../../docs/evidence/issue-370/README.md)
for current validation and review status. The example is a method to verify
reachability, not a rule to delete every component lacking an application import.
