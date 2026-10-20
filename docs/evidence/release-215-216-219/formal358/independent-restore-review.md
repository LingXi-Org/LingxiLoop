# Independent restore rehearsal review

Reviewed 2026-10-20, read-only. Initial frozen code:
`29dfd5e6b1525c9d400e04286a954aab6e4c9745`; final frozen code:
`2a57d68b895ccb26dc06a65a0adb19324273bb3c`.
The prior failure model is `689e60611f5dc98274514843fe55497567539cd4`.
No rehearsal, Docker, database, npm, provider, production, or network command was run
for this review. No author/release source was changed.

## Finding: P2 — URL query parameters can bypass the owned-database boundary

Location: `scripts/independent-memory-restore.mjs:21–22,40,127–128`;
`scripts/independent-memory-restore-step.mjs:8–10`. Present in both frozen commits.

The input check validates the URL authority and pathname, but `dbURL()` retains
all input query parameters while replacing the authority port with the owned
container's published port. The installed `pg-connection-string/index.js:40–64`
copies query parameters first and only fills `host` and `port` from the URL when
those query parameters are absent.

Consequently, an input with the otherwise-valid synthetic local form
`postgresql://postgres:<synthetic-password>@127.0.0.1:55432/postgres?port=55432`
passes the guard. `dbURL()` visibly changes `URL.port`, but node-postgres still
connects to query-parameter port 55432. A query `host` can likewise override
the checked loopback host. The first parent `Pool.query()` and `CREATE DATABASE`
can therefore target the shared or another database. The subprocess repeats the
same URL-level check and does not close the gap. Owned-container cleanup would
not remove an accidentally created database on that different server.

This is established by the actual caller/parser code; no connection or exploit
was attempted. It does not establish that either recorded successful rehearsal
used such input, and does not invalidate its measured restore assertions.

Minimal correction: derive a new PostgreSQL URL from fixed loopback host, observed
owned port and owned database name, copying only the validated synthetic username
and password. Discard input query/fragment (or reject any query except a narrowly
validated `sslmode=disable`). Validate the child URL under the same rule. A pure,
no-network pg parser test should prove that `?port=55432`, `?host=...`, query user,
and connection-file options cannot affect the effective target. Do not connect
to any alternate endpoint to test this.

## Verified implementation and evidence

1. Source authenticity:
   `main:95–116` uses the backup helper's pinned formal 3.5.6 integrity/schema hash
   and all 46 source migration checksums. Source runtime extraction is separate
   from the target runtime. Source commit
   `c6c47bddeabb4488f9fe93391f15c695a528260c` has no difference from deployed
   `ac9069460e99a20fac7f2c3de87c60f2bec66924` in the checked package/lock,
   database, and memory-resolver inputs. `step:90–92` calls the actual old
   migration runner and readiness check. There is no manual edit to schema
   version, installation, or migration-ledger rows to manufacture 46/12.
2. Actual old source provenance:
   `step:46–80,102–114` uses formal 3.5.6 public Worker, synthetic reviewer and
   native memory.apply for three durable writes. The final delta correlates
   tool.completed to the matching public tool.started ID and checks non-error
   completion, rather than expecting a missing completion name. Administrative
   writes with no source workId are deliberately negative controls; no source
   workId is fabricated into their memory records.
3. Snapshot and restore:
   the imported backup helper performs REPEATABLE READ READ ONLY,
   pg_export_snapshot and pg_dump --snapshot, then independently restores and
   compares counts/provenance. The outer rehearsal performs a second pg_restore
   into its separately named target and compares every public/lingxios table's
   count and deterministic content digest. A source insert after the snapshot
   marker remains absent from both restores. The all-table hash inventory is
   collected just before snapshot export, while this owned fixture is quiescent;
   it is not an in-snapshot hash scan of a concurrently active production DB.
4. Migration and recovery:
   `step:126–149` calls the actual target runner, verifies missing production-mode
   drain acknowledgment rejects unchanged, executes 47/native015, injects failure
   only into a temporary copy of 48, observes committed product47/native13 and no
   48 column, then executes the immutable 48 alone. Exact installation/ledger
   no-op and 11 nullable JSONB columns are checked. `main:158–161` compares all
   old columns of 171 non-provenance tables. No old-schema rollback is attempted.
5. Old binary refusal:
   `step:150–156` runs both old product readiness and the formal 3.5.6 public
   runtime startup against real native13; both must reject without modifying
   provenance. This proves startup refusal, not termination of existing writers.
6. Public backfill:
   bounded cursor pages, 3 proven migrations / 4 isolated records, repeated no-op,
   principal/tenant/group rejection, stale CAS, current deletion after historical
   room revocation, control-plane restart and departed-agent denial are asserted.
   Final delta adds an actual revoked-scope API denial before current deletion.
7. Resource ownership:
   apart from the URL override finding, intended connectivity uses a newly named,
   labelled, random-loopback PostgreSQL container, not shared port 55432.
   Final delta verifies both Docker HostConfig tmpfs and the actual filesystem
   type, with no persistent volumes. Tool containers use this exact container's
   network and invoking UID/GID. Cleanup uses exact generated names plus the
   matching ownership label before removal; temporary paths are owned mkdtemp
   paths with a prefix/parent guard. There is no prune or foreign-database drop.
8. Credentials/network:
   child environments are an explicit allowlist with synthetic service values,
   dotenv disabled and no external provider; fetch throws and counts attempts.
   Only the pre-existing synthetic test password is passed to the owned fixture.
   The backup helper's production execute function is imported but never called.
   Its synthetic parser envelope is accurately labelled local-subprocess-not-komodo.

## Exact receipts

Initial formal receipt:
`/tmp/issue216-independent-restore-formal-1/receipt.json`
SHA256 `303d6a9b8d852e2fcdb4beff99d9fe1d7313142b10a2da65ac2a2dd35155f1d2`.
It predates frozen code 29df: targetCommit is 689e606 and its two driver hashes
do not equal the 29df files. It remains earlier-run evidence, not exact-head
qualification of either frozen source revision.

Final formal receipt:
`/tmp/issue216-independent-restore-final-formal-2/receipt.json`
SHA256 `15cfb6d53282637f2aafc1d1cf55abf9b1d536337f9b0324076d2afb83f821fb`.
Its targetCommit equals 2a57d68b, and independently hashed git blobs exactly match:

- main: `514398997eba8efdf52496288d6c5004d6a73b4526b54303f3aa8c3723305ac3`
- step: `1efe27ab0c90f7e99a68fc453a4fd8634a7bc9b779f9c5e723c250963ac1917a`

Recorded run: 24.150 seconds, 5 successful phases, actual PostgreSQL 16.15,
source 46/12/3.5.6, target 48/13/formal3.5.8; 234 source rows in 174 tables,
all restored counts/hashes equal, 171 old-column table hashes retained; source
and restored aggregate hash
`e6956bb3a178498d8c38a8293f2546d4a2d797f51911d1b07665b2ddae405fc3`.
Target registry gitHead is `35ac1208fcf2bd6cb1852f474175e9eb7e2083ec`;
tar SHA256 is
`ee308270402b220452f8eb4e92e9c1d25a68466525f21827203bd5078a9c1bcb`.
All four cleanup flags are true. Per-phase fetch-attempt counters are zero.
The top-level production/shared request zeros are declared counters, not an
independent network audit; the URL finding limits the unconditional isolation
claim until corrected.

## Conclusion and limits

One actionable P2 remains in the reusable rehearsal's connection guard. No other
P1/P2 was found in the reviewed restore/migration assertions or the two final
fixture/evidence corrections. The final exact-head receipt supports the stated
local synthetic restore and forward-upgrade result, not production backup or
production drain qualification.

No live provider, production data/backup, external IM/object-store consistency,
production stop, resource load, cancellation-failure matrix, or long soak was
independently tested here. The retained session row proves durable preservation,
not new provider-history injection. Production still needs its separate verified
backup and drain of all Web/Worker writers; after 47 commits, recovery must remain
compatible fix-forward.
