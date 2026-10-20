# Independent source backup, restore and native13 upgrade

This rehearsal uses a new owner-labelled, tmpfs PostgreSQL container on a random
loopback port. It never connects to the shared local database, production, Redis,
an IM service or an external model provider. It does not authorize a production
stop or migration.

The source is frozen product `c6c47bddeabb4488f9fe93391f15c695a528260c`, with the
formally published 3.5.6 tarball and its actual native12/product46 migration runner.
The deployed application source `ac9069460e99a20fac7f2c3de87c60f2bec66924` is checked
to have identical package/lock, database and memory-resolver inputs. No version,
installation or migration-ledger row is edited to manufacture the source state.
The target is this branch's product runner with the independently extracted,
registry-integrity-verified official 3.5.8 package (native13/product48).

The five subprocess phases and intervening assertions cover:

- Actual source bootstrap and synthetic old data. Three writes go through the old
  public Worker, independent synthetic review and native `memory.apply` tools.
  The old administrative initialization API genuinely omits source `workId`;
  those documents remain negative controls, without fabricated source proof.
- The existing backup helper's exported snapshot and `pg_dump`, its own restore
  check, and a second independently created restore used for the upgrade. Every
  public/native table is compared by count and content digest. A source commit
  after the snapshot marker is excluded from the restored database.
- Missing production-mode drain acknowledgment rejects before upgrade. Real
  0047/native015 commits; a fault in an isolated copy of 0048 rolls back only0048.
  Running the immutable migrations repairs forward to48. All11 new nullable JSONB
  columns, exact installation/ledger no-op and retained old-column hashes pass.
- Frozen old product readiness and formal3.5.6 public runtime startup both reject
  the real upgraded schema, without changing its provenance.
- Public backfill dry-run, bounded pages, repeated no-op and current authorization.
  Provable private documents migrate; old administrative, expired and shared-group
  documents stay isolated. Stale CAS and foreign principal/tenant/group access are
  rejected. Current legal deletion survives source-room revocation and control
  restart without resurrection; departure of the current agent revokes access.

Run with Node22 and existing installed non-runtime dependencies. Obtain the two
formal package tarballs and target registry metadata through the already
configured legitimate package access; the script itself performs no downloads.
Set `RESTORE_REHEARSAL_LOCAL_URL` in the environment to the existing synthetic local
PostgreSQL test URL. It supplies only the existing test password: the URL is never
connected to. Its hostname/user/database are validated, and every actual client
must use the new random port and uniquely owned database.

```sh
node scripts/independent-memory-restore.mjs \
  --output /tmp/restore-qualification-UNIQUE \
  --source-tar /ABSOLUTE/official-3.5.6.tgz \
  --target-package /ABSOLUTE/existing/node_modules/@lyyzka/lingxios \
  --target-tar /ABSOLUTE/official-3.5.8.tgz \
  --target-registry /ABSOLUTE/official-3.5.8-registry.json
```

`--target-package` is overridden by the verified private extraction when the two
formal options are present. Without them, the receipt explicitly marks the target
non-formal. Add `--negative-source-control` with a new output directory to prove
that initializing the source using the current target actually creates13/48 and
is rejected before backup (expected process exit1). Existing output directories
are rejected. Receipts are0600; temporary source/runtime archives and all matching
owned containers are removed even on assertion failure. No volume is allocated.
The existing local PostgreSQL image is reused by immutable image ID, without a pull.

The backup helper's transport is adapted only for the owned local mount, database,
network and existing synthetic credentials. Its parser receives a synthetic local
transport envelope; this is explicitly **not a Komodo receipt** or production
backup. Original/adapted command hashes and actual subprocess exit status are
retained. Dumps contain synthetic data only and are removed with the owned fixture.

Earlier failures are retained with their classifications, not counted as product
regressions or passing tests. In particular, a root-owned temporary backup folder
required one exact owned-path cleanup recovery; its original receipt and separate
recovery evidence remain intact. Tool subprocesses now use the invoking UID/GID.

Limitations: this is synthetic data and a local PostgreSQL restore, not a backup of
production. It does not test external IM/object-store snapshot consistency, real
model judgment, live-provider behavior, load or a long soak. The retained session
row proves durable content preservation, not a fresh model-history injection test.
Old-process startup refusal does not stop an already-running schema12 writer;
production still needs verified drain of all writers and a separate real backup.
After47 commits, recovery is compatible fix-forward; this rehearsal never rolls
schema13 back to12. Production stop/migration remains pending separate confirmation.

## Frozen results

Implementation: `873f9fd311f01de2df294cde11586dc8f012ffde`. The final official-package
run (`guarded-formal.json`) exited0 in23.243s: all5 phases passed,174 tables/234 rows
restored exactly, and171 tables retained their old-column hashes after upgrade.
The retained set includes8 memory documents,4 scope/epoch rows,2 historical memory
versions and3 session/history rows. The backfill used4 pages:3 migrated and4
isolated; both actual source revocation and current deletion succeeded as expected.
All owning containers/tools/archives were removed; the PostgreSQL data filesystem
was verified as tmpfs with0 persistent volumes. PostgreSQL was16.15, Node22.23.3.

The final target tar SHA256 is
`ee308270402b220452f8eb4e92e9c1d25a68466525f21827203bd5078a9c1bcb`;
its registry source is `35ac1208fcf2bd6cb1852f474175e9eb7e2083ec`.
The full SRI, source official-package integrity, schema hashes and three implementation script
hashes are in the receipt. `static-checks.json` records syntax/lint/diff checks.
`attempts-manifest.json` classifies every earlier result, including expected
negative controls, harness mistakes and the separate owned-path cleanup recovery.
None of those earlier failed processes is counted as a passing qualification.

Independent isolation review found that query options in a PostgreSQL URL can
supersede its authority host/port in the real pg parser. `url-isolation/` retains
both original pure-parser failures (0/2), followed by3/3 passing controls with no
network access. The final main and subprocess guards reject query/fragment values
and non-PostgreSQL/non-loopback identities; each connection is rebuilt from a new
fixed URL with only the existing synthetic password and the owned port/database.
The final formal-package run above was repeated after this fix. Earlier successful
receipts remain under `attempts/`; their actual inputs contained no query options.
