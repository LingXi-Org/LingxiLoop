# Direct host source staging contingency — before implementation

Existing one-time online clone A6ad7723fe06d5e1f79836d40 remains unresolved.
Do not run a second clone, overwrite its checkout, stop services, or call this
contingency until that exact operation is terminal and the original driver is
exited. The preserved failed/uncertain receipt must be bound by hash.

User authorized task-scoped recoverable deployment restructuring at13:46 while
preserving data/volumes/backups/credentials/security and online-first gates.
Komodo2.3.3 WriteStackFileContents in host mode uses mogh_secret_file1.0.1
write_async: create parent dirs, open/create/truncate, write/flush. It can stage
three exact PUBLIC tracked Compose templates from local git show f56 at the same
owned host paths, without any Git clone, .env copy or direct host Compose.

Failure cases and guards before execution:
- Unknown original action/driver still alive: abort, no config/file mutation.
- Wrong baseline/container/host, bind mounts, nonempty credential accounts,
  auto-update, hooks/wrappers, extra paths/dependencies: abort before writes.
- Git bytes or file mode not exact qualified ordinary blob100644: abort.
- Only branch/commit/reclone/files_on_host may change, full before/after config
  equality in memory. Never change environment/interpolation/security settings.
- Allow only stack-listed compose.yml and exact locally derived bytes. The API
  logs those bytes: prove they are the public repository template, never an env
  file or interpolated output. No raw response/log contents persisted.
- Native writer is non-atomic and follows symlinks. Use only these established
  owned inline checkout paths, verified normal tracked tree entries, no active
  source writer, no custom paths/binds/hooks. A write failure is not success;
  re-read exact hashes and require terminal successful WriteStackContents before
  any oneoff. No inferred success or retry after unknown HTTP outcome.
- Staging each stack uses host mode first with auto_update=false. Official
  background CheckStackForUpdate cannot deploy with that flag. Host refresh may
  fail before the file is written; this is not a deployment and must not trigger
  service actions. After write require fresh cache with no errors/missing files.
- Verify allthree actual host hashes, two rounds of real metadata on both apps
  and read-only source SQL on core, separated by>5s. Original four container
  IDs, image IDs, PIDs, health and restart counts stay unchanged throughout.
- All cached app target image digests/IDs remain exact, mirrorprefix unchanged,
  empty Komodo accounts; no arbitrary alternative mirror/login/TLS changes.
- A new backup and writer barriers are required later; no backup, stop, migration
  or deploy in this staging script. Original historical backup remains retained.
