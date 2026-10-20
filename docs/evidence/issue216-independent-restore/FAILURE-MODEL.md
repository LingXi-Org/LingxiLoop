# Independent source restore and native13 upgrade failure model

Written before implementation. Base product commit: d1b42220d88026242c293482e8adf598af6f604e.
Source inventory: c6c47bddeabb4488f9fe93391f15c695a528260c; deployed application source
ac9069460e99a20fac7f2c3de87c60f2bec66924 must have identical migration/runtime inputs.
Source is formally published runtime3.5.6/native12/product46. Target is3.5.8/native13/product48.
The initial installed target is a local candidate; final official-package qualification is a separate run.

Failures to demonstrate or reject:

1. Preparing the source with the current target package/migrations silently creates native13/product48.
   Assert exact source inventory/provenance, real source schema hash and baseline package before backup;
   never edit schema_version or forge installation/schema_migrations rows to manufacture12/46.
2. A dump after an uncoordinated concurrent commit differs from the compared source snapshot. Hold a real
   exported snapshot and compare restored counts/provenance/content hashes from that same snapshot;
   prove a later synthetic source commit does not enter the restored snapshot.
3. A restore is accepted without pg_restore success, source checksums, or retained memory/epoch/history
   contents. Use an independently created owned restore database and compare metadata/hashes only.
4. The target runner skips015, uses a placeholder0047, mutates old migration checksums, or drops old data.
   Execute real immutable46→47/native13→48 through the product runner and compare retained rows,
   memory versions/epochs/history, all11 nullable content columns and exact runtime/schema provenance.
5. A failed0048 undoes or obscures committed47/native13, or an operator restarts schema12 software.
   Fail only an isolated temporary copy of0048, verify47 remains committed and repair forward.
   The real old product readiness checker and old public runtime must refuse the upgraded database.
6. A second migration rewrites installed_at, duplicates history, or changes retained rows. Compare exact
   installation and migration snapshots after the first successful upgrade and a second no-op.
7. Legacy backfill copies ambiguous/revoked/foreign/group/expired memory into a personal scope, ignores
   the current principal/course, or resurrects a deleted document. Use the target public memory API and
   product resolver on restored synthetic identities; prove eligible migration, dry-run, cursor/repeat,
   unauthorized rejection, current CAS and post-delete non-resurrection without private runtime writes.
8. “Old instance rejected” is only a version string check. Run the frozen old product readiness function
   with its formal3.5.6 dependency and the public old runtime's startup schema guard against actual13.
9. A fixture contacts shared55432, production, Redis or an external provider, pulls an image, emits bodies
   or credentials, or overwrites historical evidence. Use an existing local image ID, a fresh owner-labelled
   tmpfs PG container with random loopback port, no provider, sanitized subprocess errors, exclusive0600
   evidence files, and only existing synthetic local connection credentials in process environment.
10. Failed dump/restore/test work leaves a container, backend, volume or source archive behind. Preserve
    the red receipt, close all owned clients, remove only matching-label owned containers/tool instances,
    verify absence, and retain counts/hashes/status. Never use global prune, force-drop of foreign DBs,
    shared author test DBs, or production stop/migrate/recovery actions.

This work adds rehearsal scripts/evidence only, with no product migrations, lockfile or runtime changes.
It does not qualify production downtime, external IM/object-store consistency, provider quality, or a
rollback to schema12 after47 commits. That boundary remains compatible fix-forward only.
