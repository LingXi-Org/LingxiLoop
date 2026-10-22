# Two-model configuration release verification

This is configuration tooling, not a production configuration receipt or a
completed knowledge migration. No production write was performed in this
development task. A read-only Komodo inspection confirmed both app stacks
have one existing environment entry for each model key, with `KEY = value`
format; raw environments and credentials were not saved or printed.

The failure model preceded implementation. Core and adapter regression
contracts were written first; their initial red runs failed because the new
modules did not yet exist. The final focused suite has 9 passing cases, and
the existing owning deployment-contract command including this suite has
215 passing cases, zero failures and zero skips.

`cli-functional.json` records two complete offline CLI checks. Credentials
were absent and the proxy pointed to an unreachable loopback address. Exact
historical public source provenance was validated together with explicitly
synthetic shadow/fence metadata; this fixture is not a deployable production
plan. A mismatched fence revision was rejected even after outer hashes were
resealed. Neither check made a production read or write.

`validation.json` binds the tested source bytes and commands. Final exact-head
CI and independent review remain separate merge/release gates. The designated
sole producer must use the newest real source acceptance, actual stopped KB
identity, finite actual migration plan and actual fence receipt to prepare
and execute this operation.

See [operator workflow](../../../model-configuration-release.md) for inputs,
exclusive receipts and explicit continuation. Completion leaves the old KB
API/worker stopped for the separately reviewed shadow backfill and cutover;
it is not evidence of complete knowledge or native memory reindexing.
