# Source backup and restore failure model

Written before the tool/tests. This task prepares issue 216's source backup; no
candidate migration, production call or rollout is performed. Only the release
owner may later execute a reviewed plan through existing Komodo authorization.

| Failure | Required behavior / short check |
| --- | --- |
| Wrong source, modified migration, different runtime package | Bind the concrete source commit, both manifests/locks, every migration checksum and formally published source schema resource hash (checked against the installed formal package in local verification). Reject before any request. Source is product46/runtime3.5.6/native12; target migration remains unperformed. |
| Default invocation changes production | Default creates only a private exclusive local plan. Execution requires explicit `--execute`, the exact reviewed plan file and a new receipt path. Tests intercept fetch and require zero requests for planning/invalid plans. |
| Counts and dump see different writes | One read-only repeatable-read exported snapshot owns counts, provenance and pg_dump. Restore comparison uses that snapshot's counts, never a later live SELECT. Exercise with isolated synthetic PostgreSQL. |
| Destructive live SQL or accidental restore target | Source psql is read-only; pg_restore targets only the full random owned database name, unequal to the live name. No target migration SQL, UPDATE, DDL or reset against source. |
| Wrong endpoint/service or duplicate attempt | Fixed HTTPS origin and core-state/postgres target; no redirects. Exclusive server attempt directory atomically reserves the attempt. Reusing an attempt fails before dump/createdb. Never auto-retry Execute. |
| Full shared volume or runaway SQL/process | Check free disk before dump/restore; bounded connect/statement/lock/idle/process deadlines. Monitor failure stage, not raw stderr. |
| Failed restore/cleanup | Require exact table counts and provenance. Drop only this invocation's successfully created isolated DB; never a preexisting DB. Keep backup; cleanup failure prevents success. |
| Cancellation/network loss after Execute begins | Report uncertain outcome with attempt/database/update ID; do not claim remote cancellation, rollback or absence of writes. Persist update ID immediately, poll only it, no automatic new request. |
| Tampered receipt or incomplete marker | Require Complete/success true, exactly one completion marker, matching source/command/attempt, hashes and all equalities. Reject malformed/duplicated/count omissions. |
| Credentials or memory content enter reports | Credentials only from injected env. No values in command text/files/logs. Fixed receipt allowlist; suppress remote stderr/raw errors. Dump stays private on server's original data volume. |
| Restore rehearsal mistaken for target upgrade | Always record migrationRehearsal=not-performed. Source restore is a prerequisite; a later exact target installer rehearsal is still required. |

Local integration uses a new *_test database on the existing localhost55432
fixture and no provider. No production credentials, terminal, SSH or network
probe is needed to implement/test the tool. Unknown remote outcomes are not
cleaned up by issuing another Execute operation.

## Overall deadline regression (independent review, before fix)

The outer GNU timeout and inner default timeouts create different process groups.
At the overall deadline the waiting shell can miss its EXIT cleanup after KILL,
while pg_restore/psql continues. Before changing implementation, add a bounded
process regression that preserves generated timeout modes, and an isolated real
PostgreSQL restore whose generated-column function delays COPY. At the deadline
require child completion to be prevented, the owned restore DB removed, no active
restore backend, no success marker, source/preexisting databases preserved, and
the dump retained. The test alone may explicitly terminate its uniquely owned
synthetic sessions in teardown to avoid leaving red-test work behind.
