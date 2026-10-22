# Two-model configuration release verification

This is configuration tooling, not a production configuration receipt or a
completed knowledge migration. No production write was performed in this
development task. A read-only Komodo inspection confirmed both app stacks
have one existing environment entry for each model key, with `KEY = value`
format; raw environments and credentials were not saved or printed.

The failure model preceded implementation. Core and adapter regression
contracts were written first; their initial red runs failed because the new
modules did not yet exist. The final focused suite has 13 passing cases, and
the existing owning deployment-contract command including this suite has
219 passing cases, zero failures and zero skips.

A later same-image `NODE_VERSION` drift negative first failed with a missing
rejection. The adapter now binds that value to the audited baked Node22 value
before accepting any container; the complete owning command was rerun and
passed after the two-line guard change.

Review negatives reproduced a quoted multiline secret patch (both `=` and
Compose `:` syntax), dropped failed-native IDs, and lost HTTP403 metadata.
The fixes fail closed on unsupported dotenv syntax, retain all terminal IDs
for fresh outcome/identity readback, and preserve authorization denial in the
final receipt. A live shadow `status` oneoff checks the current real fence,
pointer revision, source watermark and events rather than trusting old JSON;
its staged pull-never image must match a raw full KB source/layer audit.

`cli-functional.json` records five complete offline/synthetic checks. Credentials
were absent and the proxy pointed to an unreachable loopback address. Exact
public source provenance for the actual final PR315 acceptance was validated
together with explicitly synthetic shadow/fence/audit metadata; this fixture
is not a deployable production plan. A mismatched fence revision and failed
KB source audit were rejected even after outer hashes were resealed. Failed
native updates were freshly read and rejected if target, outcome or completion
changed. A read HTTP403 remained in the receipt and refused continuation.
None of these checks made a production read or write. Reproduce with:

```text
node --use-env-proxy docs/evidence/issue-297/model-config-release/verify-cli.mjs
  /absolute/source-evidence-directory /absolute/new-functional-report.json
```

That directory must contain the actual `target-acceptance.json`, `target-audit.json`
and `target-config.json`; the harness creates clearly synthetic private KB
fixtures in a new temporary directory and runs the real CLI without credentials.

`validation.json` binds the tested source bytes and commands. Final exact-head
CI and independent review remain separate merge/release gates. The designated
sole producer must use the newest real source acceptance, actual stopped KB
identity, finite actual migration plan, actual fence receipt and audited
pull-never live status image to prepare
and execute this operation.

See [operator workflow](../../../model-configuration-release.md) for inputs,
exclusive receipts and explicit continuation. Completion leaves the old KB
API/worker stopped for the separately reviewed shadow backfill and cutover;
it is not evidence of complete knowledge or native memory reindexing.
