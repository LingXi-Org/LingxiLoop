// Prepared for the release owner. --plan is local-only; --execute creates a backup
// and a disposable restore database through Komodo, never migrates the live DB.
import { createHash, randomBytes } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { packageResources, releaseVersions } from '@lyyzka/lingxios'

const root = fileURLToPath(new URL('../', import.meta.url))
const hash = value => createHash('sha256').update(value).digest('hex')
const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`
const newTables = ['im_visualize_documents', 'im_visualize_states', 'im_visualize_pages', 'im_visualize_gestures']
const marker = 'VISUALIZE_BACKUP_'
const runFile = promisify(execFile)

export async function buildVisualizeBackupPlan({ sha, attempt }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('A concrete lowercase 40-character SHA is required')
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(attempt ?? '')) throw new Error('A safe explicit attempt ID is required')
  if (releaseVersions.runtime !== '3.5.3' || releaseVersions.schema !== 12 || releaseVersions.controlPlane !== 11) {
    throw new Error('This rehearsal requires the published LingxiOS 3.5.3/schema 12/protocol 11 dependency')
  }
  const migrationDir = new URL('../server/src/db/migrations/', import.meta.url)
  const names = (await readdir(migrationDir)).filter(name => /^\d{4}_[a-z0-9_-]+\.sql$/.test(name)).sort()
  const migrations = await Promise.all(names.map(async filename => {
    const [, number, name] = /^(\d{4})_(.+)\.sql$/.exec(filename)
    const sql = await readFile(new URL(filename, migrationDir), 'utf8')
    return { version: Number(number), name, checksum: hash(sql), sql }
  }))
  if (migrations.length !== 46 || migrations.some((item, index) => item.version !== index + 1)
      || migrations[45].name !== 'visualize') throw new Error('Expected exactly contiguous migrations 0001 through 0046_visualize')
  const migration = migrations[45]
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK|END)\s*;|^\s*\\/im.test(migration.sql)) {
    throw new Error('0046 must be transaction-body SQL without transaction or psql commands')
  }
  const expectedMigrations = migrations.slice(0, 45).map(({ version, name, checksum }) => ({ version, name, checksum }))
  const runtime = { runtime: releaseVersions.runtime, schema: releaseVersions.schema,
    protocol: releaseVersions.controlPlane, schemaHash: hash(await readFile(packageResources().schema)) }
  const verifyDb = `visualize_verify_${sha.slice(0, 12)}_${randomBytes(8).toString('hex')}`
  const backupDir = `/var/lib/postgresql/data/visualize-upgrade-backups/${sha}/${attempt}`
  const migrationJson = sqlLiteral(JSON.stringify(expectedMigrations))
  const runtimePredicate = `runtime_version = '${runtime.runtime}' AND schema_version = ${runtime.schema}
    AND protocol_version = ${runtime.protocol} AND schema_sha256 = '${runtime.schemaHash}'`
  const assert = condition => `SELECT 1 / CASE WHEN (${condition}) THEN 1 ELSE 0 END;`
  const precondition = `
${assert(`(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'checksum',checksum) ORDER BY version) FROM public.schema_migrations) = ${migrationJson}::jsonb`)}
${assert(`(SELECT count(*) FROM public.lingxios_installation) = 1 AND (SELECT bool_and(${runtimePredicate}) FROM public.lingxios_installation WHERE singleton)`)}
${assert('(SELECT count(*) FROM lingxios.schema_version) = 1 AND (SELECT version FROM lingxios.schema_version WHERE singleton) = 12')}
${assert("to_regclass('public.im_ui_revisions') IS NOT NULL AND to_regclass('public.im_ui_user_states') IS NOT NULL")}
${assert(newTables.map(name => `to_regclass('public.${name}') IS NULL`).join(' AND '))}
${assert("NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios') AND c.relkind='f')")}
`
  const runtimeQuery = `SELECT jsonb_build_object('runtime',runtime_version,'schema',schema_version,
    'protocol',protocol_version,'schemaHash',schema_sha256,
    'actualSchema',(SELECT version FROM lingxios.schema_version WHERE singleton))
    FROM public.lingxios_installation WHERE singleton;`
  const provenanceQuery = `SELECT jsonb_build_object('runtime',
    (SELECT jsonb_build_object('runtime',runtime_version,'schema',schema_version,'protocol',protocol_version,'schemaHash',schema_sha256)
     FROM public.lingxios_installation WHERE singleton),
    'actualSchema',(SELECT version FROM lingxios.schema_version WHERE singleton),
    'migrations',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'checksum',checksum) ORDER BY version) FROM public.schema_migrations));`
  // The commands produced by \gexec execute within this same transaction.
  const countsQuery = String.raw`SELECT format('SELECT json_build_array(%L,%L,count(*)) FROM %I.%I;',n.nspname,c.relname,n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','lingxios') AND c.relkind IN ('r','p')
    ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"
\gexec
`
  // Hash only structural catalog data, never emit function bodies/default expressions.
  const catalogQuery = `WITH objects AS (
    SELECT 'relation' AS kind,c.oid::text AS id,jsonb_build_array(n.nspname,c.relname,c.relkind,c.reltype,c.relowner,c.relacl,c.reloptions,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relpartbound)::text AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios')
    UNION ALL SELECT 'column',a.attrelid||':'||a.attnum,to_jsonb(a)::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios')
    UNION ALL SELECT 'default',d.oid::text,to_jsonb(d)::text FROM pg_attrdef d JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios')
    UNION ALL SELECT 'constraint',c.oid::text,to_jsonb(c)::text FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','lingxios')
    UNION ALL SELECT 'trigger',t.oid::text,to_jsonb(t)::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios')
    UNION ALL SELECT 'function',p.oid::text,to_jsonb(p)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','lingxios')
    UNION ALL SELECT 'type',t.oid::text,to_jsonb(t)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','lingxios')
    UNION ALL SELECT 'policy',p.oid::text,to_jsonb(p)::text FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','lingxios')
  ) SELECT md5(string_agg(kind||':'||id||':'||definition,E'\\n' ORDER BY kind COLLATE "C",id COLLATE "C")) FROM objects;`
  const transactionBody = `${migration.sql}\nSET search_path TO public;\nINSERT INTO public.schema_migrations(version,name,checksum) VALUES(46,'visualize','${migration.checksum}');\n`
  const postcondition = `
${assert(`(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'checksum',checksum) ORDER BY version) FROM public.schema_migrations WHERE version<=45) = ${migrationJson}::jsonb`)}
${assert(`(SELECT count(*) FROM public.schema_migrations)=46 AND (SELECT count(*) FROM public.schema_migrations WHERE version=46 AND name='visualize' AND checksum='${migration.checksum}')=1`)}
${assert(`(SELECT count(*) FROM public.lingxios_installation)=1 AND (SELECT bool_and(${runtimePredicate}) FROM public.lingxios_installation WHERE singleton)`)}
${assert('(SELECT count(*) FROM lingxios.schema_version)=1 AND (SELECT version FROM lingxios.schema_version WHERE singleton)=12')}
${assert("to_regclass('public.im_ui_revisions') IS NOT NULL AND to_regclass('public.im_ui_user_states') IS NOT NULL")}
${newTables.map(name => assert(`(SELECT count(*) FROM public.${name})=0`)).join('\n')}
`
  const files = {
    'precondition.sql': precondition,
    'counts.sql': countsQuery,
    'provenance.sql': provenanceQuery,
    'runtime.sql': runtimeQuery,
    'catalog.sql': catalogQuery,
    'postcondition.sql': postcondition,
    'migration.sql': migration.sql,
    'rollback.sql': `BEGIN;\n${transactionBody}ROLLBACK;\n`,
    'commit.sql': `BEGIN;\n${transactionBody}COMMIT;\n`,
    'snapshot.sql': String.raw`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL row_security=off;
SET LOCAL statement_timeout='10min';
SET LOCAL idle_in_transaction_session_timeout='20min';
SET LOCAL lock_timeout='10s';
\i :precondition_file
\o :snapshot_file
SELECT pg_export_snapshot();
\o :counts_file
\i :counts_query_file
\o :provenance_file
\i :provenance_query_file
\o :runtime_file
\i :runtime_query_file
\o :ready_file
SELECT 'ready';
\o /dev/null
`,
  }
  const fileWrites = Object.entries(files).map(([name, contents]) =>
    `printf '%s' ${shellQuote(Buffer.from(contents).toString('base64'))} | base64 -d > "$work/${name}"`).join('\n')
  // No credential value is ever present in command text. All diagnostic stderr is
  // suppressed; stage markers are the only failure output, including cleanup.
  const command = `set -eu
set +x
umask 077
export LC_ALL=C
export PGPASSWORD="$POSTGRES_PASSWORD"
export PGCONNECT_TIMEOUT=15
export PGOPTIONS='-c statement_timeout=600000 -c lock_timeout=10000 -c row_security=off -c search_path=public'
backup_dir=${shellQuote(backupDir)}
verify_db=${shellQuote(verifyDb)}
created=0
holder=''
fifo_open=0
work=''
stage=initialization
success=0
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  set +e
  if [ "$fifo_open" = 1 ]; then exec 9>&-; fi
  if [ -n "$holder" ]; then kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null; fi
  if [ "$created" = 1 ]; then
    if [ "$verify_db" != ${shellQuote(verifyDb)} ] || [ "$verify_db" = "$POSTGRES_DB" ]; then
      result=1
      stage=cleanup-guard
    elif ! timeout -k 10 60 dropdb -h postgres -U "$POSTGRES_USER" --maintenance-db=postgres "$verify_db" >/dev/null 2>&1; then
      result=1
      stage=cleanup-database
    fi
  fi
  if [ -n "$work" ]; then rm -f "$work"/* 2>/dev/null; rmdir "$work" 2>/dev/null; fi
  if [ "$result" = 0 ] && [ "$success" = 1 ]; then
    if ! printf '{"complete":true,"isolatedDatabaseRemoved":true}\\n' > "$backup_dir/completion.json"; then
      printf '${marker}FAILED_STAGE=completion-evidence\\n'
      exit 1
    fi
    printf '${marker}COMPLETE=1\\n'
  else
    printf '${marker}FAILED_STAGE=%s\\n' "$stage"
    result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
exec 2>/dev/null
for utility in timeout mkfifo psql pg_dump pg_restore createdb dropdb sha256sum base64 cmp grep df awk; do command -v "$utility" >/dev/null; done
test "$verify_db" != "$POSTGRES_DB"
test -n "$POSTGRES_USER"
test -n "$POSTGRES_DB"
work=$(mktemp -d /tmp/visualize-backup.XXXXXXXXXX)
stage=capacity-initial
db_bytes=$(timeout -k 10 60 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c 'BEGIN READ ONLY; SELECT pg_database_size(current_database()); ROLLBACK;')
printf '%s' "$db_bytes" | grep -Eq '^[0-9]+$'
headroom() {
  factor=$1
  phase=$2
  df -Pk /var/lib/postgresql/data > "$work/disk-free"
  free_kib=$(awk 'NR==2 {print $4}' "$work/disk-free")
  printf '%s' "$free_kib" | grep -Eq '^[0-9]+$'
  free_bytes=$((free_kib * 1024))
  required_bytes=$((db_bytes * factor + 536870912))
  printf '{"phase":"%s","databaseBytes":%s,"freeBytes":%s,"requiredBytes":%s}\\n' "$phase" "$db_bytes" "$free_bytes" "$required_bytes" > "$work/capacity-$phase.json"
  printf '${marker}CAPACITY='
  cat "$work/capacity-$phase.json"
  test "$free_bytes" -ge "$required_bytes"
}
headroom 2 initial
mkdir -p ${shellQuote(`/var/lib/postgresql/data/visualize-upgrade-backups/${sha}`)}
mkdir "$backup_dir"
printf '%s\\n' ${shellQuote(JSON.stringify({ sha, attempt, isolatedDatabase: verifyDb, migrationHash: migration.checksum, runtime }))} > "$backup_dir/attempt.json"
cp "$work/capacity-initial.json" "$backup_dir/capacity-initial.json"
${fileWrites}
test "$(sha256sum "$work/migration.sql" | cut -d ' ' -f 1)" = '${migration.checksum}'
isolated() {
  test "$created" = 1
  test "$verify_db" = ${shellQuote(verifyDb)}
  test "$verify_db" != "$POSTGRES_DB"
  timeout -k 10 660 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$verify_db" -v ON_ERROR_STOP=1 "$@"
}
stage=snapshot
mkfifo "$work/snapshot-input"
exec 9<> "$work/snapshot-input"
fifo_open=1
# psql has an independent reader and fd 9 stays open until dump completion.
timeout -k 10 1800 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \\
  -v precondition_file="$work/precondition.sql" -v snapshot_file="$work/snapshot-id" \\
  -v counts_file="$backup_dir/counts-before.jsonl" -v counts_query_file="$work/counts.sql" \\
  -v provenance_file="$backup_dir/provenance-before.json" -v provenance_query_file="$work/provenance.sql" \\
  -v runtime_file="$backup_dir/runtime.json" -v runtime_query_file="$work/runtime.sql" \\
  -v ready_file="$work/ready" < "$work/snapshot-input" > /dev/null &
holder=$!
cat "$work/snapshot.sql" >&9
remaining=660
while [ ! -s "$work/ready" ]; do
  kill -0 "$holder"
  test "$remaining" -gt 0
  remaining=$((remaining - 1))
  sleep 1
done
test "$(cat "$work/ready")" = ready
snapshot=$(cat "$work/snapshot-id")
printf '%s' "$snapshot" | grep -Eq '^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$'
stage=dump
timeout -k 10 1080 pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --snapshot="$snapshot" --lock-wait-timeout=10s -f "$backup_dir/product.dump"
kill -0 "$holder"
printf 'ROLLBACK;\\n\\\\q\\n' >&9
exec 9>&-
fifo_open=0
wait "$holder"
holder=''
dump_hash=$(sha256sum "$backup_dir/product.dump" | cut -d ' ' -f 1)
printf '%s  product.dump\\n' "$dump_hash" > "$backup_dir/sha256.txt"
stage=capacity-restore
headroom 1 restore
cp "$work/capacity-restore.json" "$backup_dir/capacity-restore.json"
stage=create-isolated-database
timeout -k 10 60 createdb -h postgres -U "$POSTGRES_USER" --maintenance-db=postgres --template=template0 "$verify_db"
created=1
stage=restore
timeout -k 10 1200 pg_restore -h postgres -U "$POSTGRES_USER" -d "$verify_db" --no-owner --no-privileges --exit-on-error "$backup_dir/product.dump"
stage=verify-restore
isolated -f "$work/precondition.sql" >/dev/null
isolated -f "$work/counts.sql" > "$backup_dir/counts-restored.jsonl"
isolated -f "$work/provenance.sql" > "$backup_dir/provenance-restored.json"
cmp -s "$backup_dir/counts-before.jsonl" "$backup_dir/counts-restored.jsonl"
cmp -s "$backup_dir/provenance-before.json" "$backup_dir/provenance-restored.json"
isolated -f "$work/catalog.sql" > "$work/catalog-before"
stage=rollback-rehearsal
isolated -f "$work/rollback.sql" > /dev/null
isolated -f "$work/precondition.sql" > /dev/null
isolated -f "$work/counts.sql" > "$backup_dir/counts-rollback.jsonl"
isolated -f "$work/provenance.sql" > "$backup_dir/provenance-rollback.json"
isolated -f "$work/catalog.sql" > "$work/catalog-rollback"
cmp -s "$backup_dir/counts-before.jsonl" "$backup_dir/counts-rollback.jsonl"
cmp -s "$backup_dir/provenance-before.json" "$backup_dir/provenance-rollback.json"
cmp -s "$work/catalog-before" "$work/catalog-rollback"
rollback_hash=$(sha256sum "$work/catalog-rollback" | cut -d ' ' -f 1)
stage=commit-rehearsal
isolated -f "$work/commit.sql" > /dev/null
isolated -f "$work/postcondition.sql" > /dev/null
isolated -f "$work/counts.sql" > "$backup_dir/counts-after.jsonl"
isolated -f "$work/runtime.sql" > "$work/runtime-after"
cmp -s "$backup_dir/runtime.json" "$work/runtime-after"
grep -v '^\\["public", "schema_migrations", ' "$backup_dir/counts-before.jsonl" > "$work/old-counts"
grep -v -E '^\\["public", "(schema_migrations|im_visualize_(documents|states|pages|gestures))", ' "$backup_dir/counts-after.jsonl" > "$work/remaining-counts"
cmp -s "$work/old-counts" "$work/remaining-counts"
test "$(wc -l < "$backup_dir/counts-after.jsonl")" -eq "$(( $(wc -l < "$backup_dir/counts-before.jsonl") + 4 ))"
stage=noop-provenance-check
isolated -c 'BEGIN READ ONLY' -f "$work/postcondition.sql" -c 'ROLLBACK' > /dev/null
printf '{"dumpSha256":"%s","rollbackCatalogSha256":"%s","restoreCountsEqual":true,"rollbackCountsEqual":true,"rollbackProvenanceEqual":true,"rollbackCatalogEqual":true,"legacy0033Preserved":true,"commitCount":1,"noOpProvenance":true,"migration":{"version":46,"name":"visualize","checksum":"${migration.checksum}"}}\\n' "$dump_hash" "$rollback_hash" > "$backup_dir/verification.json"
printf '${marker}EVIDENCE='
cat "$backup_dir/verification.json"
printf '${marker}RUNTIME='
cat "$backup_dir/runtime.json"
while IFS= read -r row; do printf '${marker}COUNT_BEFORE=%s\\n' "$row"; done < "$backup_dir/counts-before.jsonl"
while IFS= read -r row; do printf '${marker}COUNT_AFTER=%s\\n' "$row"; done < "$backup_dir/counts-after.jsonl"
success=1
`
  return { sha, attempt, backupDir, isolatedDatabase: verifyDb, migrationHash: migration.checksum, runtime,
    sourceMigrations: migrations.map(({ version, name, checksum }) => ({ version, name, checksum })),
    commandHash: hash(command), command }
}

export async function verifyVisualizeBackup({ url, headers, plan }) {
  if (!/^[a-f0-9]{40}$/.test(plan.sha) || hash(plan.command) !== plan.commandHash) throw new Error('Invalid reviewed plan')
  // Prevent a valid-looking SHA label from describing uncommitted/different SQL.
  // These are local, read-only git operations, performed before any remote call.
  try {
    for (const migration of plan.sourceMigrations) {
      const filename = `${String(migration.version).padStart(4, '0')}_${migration.name}.sql`
      const { stdout } = await runFile('git', ['show', `${plan.sha}:server/src/db/migrations/${filename}`], { cwd: root, encoding: 'utf8' })
      if (hash(stdout) !== migration.checksum) throw new Error('Source mismatch')
    }
    const { stdout } = await runFile('git', ['show', `${plan.sha}:package.json`], { cwd: root, encoding: 'utf8' })
    if (JSON.parse(stdout).dependencies?.['@lyyzka/lingxios'] !== '3.5.3') throw new Error('Dependency mismatch')
  } catch {
    throw new Error('The concrete release SHA must contain the reviewed migrations and LingxiOS 3.5.3 dependency')
  }
  // This exact public API shape is shared with prepare-forum-rollout.mjs.
  const target = new URL(url)
  if (target.protocol !== 'https:' || target.hostname !== 'ops.christmas1314.xyz'
      || target.username || target.password || target.port || target.search || target.hash
      || !(target.pathname === '/' || /^\/listener\/github\/procedure\/[\w-]+\/main$/.test(target.pathname))) {
    throw new Error('Invalid Komodo endpoint')
  }
  let updateId
  async function request(path, body) {
    const response = await fetch(new URL(path, target), { method: 'POST', headers,
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`Komodo HTTP ${response.status}`)
    return response.json()
  }
  try {
    let update = await request('/execute/RunStackService', { stack: 'lingxiloop-core-state', service: 'postgres',
      entrypoint: 'sh', command: ['-ec', plan.command], user: 'postgres',
      no_tty: true, no_deps: true, detach: false, service_ports: false, pull: false })
    updateId = update._id?.$oid
    if (typeof updateId !== 'string' || !/^[a-f0-9]{24}$/.test(updateId)) throw new Error('Missing valid update ID')
    console.log(JSON.stringify({ operation: 'RunStackService', updateId, sha: plan.sha, attempt: plan.attempt,
      isolatedDatabase: plan.isolatedDatabase, commandHash: plan.commandHash }))
    const deadline = Date.now() + 70 * 60_000
    while (update.status !== 'Complete' && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2_000))
      update = await request('/read/GetUpdate', { id: updateId })
    }
    const output = (update.logs ?? []).map(log => typeof log.stdout === 'string' ? log.stdout : '').join('\n')
    const stage = /^VISUALIZE_BACKUP_FAILED_STAGE=([a-z-]+)$/m.exec(output)?.[1]
    if (update.status !== 'Complete') throw new Error('Update completion remains uncertain')
    if (!update.success || !/^VISUALIZE_BACKUP_COMPLETE=1$/m.test(output)) {
      throw new Error(`Verification did not succeed${stage ? ` at ${stage}` : ''}`)
    }
    const evidence = JSON.parse(/^VISUALIZE_BACKUP_EVIDENCE=(.+)$/m.exec(output)?.[1] ?? 'null')
    const runtime = JSON.parse(/^VISUALIZE_BACKUP_RUNTIME=(.+)$/m.exec(output)?.[1] ?? 'null')
    if (!evidence || !/^[a-f0-9]{64}$/.test(evidence.dumpSha256) || !/^[a-f0-9]{64}$/.test(evidence.rollbackCatalogSha256)
        || evidence.migration?.checksum !== plan.migrationHash || evidence.migration?.version !== 46
        || evidence.migration?.name !== 'visualize' || evidence.commitCount !== 1
        || ['restoreCountsEqual', 'rollbackCountsEqual', 'rollbackProvenanceEqual', 'rollbackCatalogEqual', 'legacy0033Preserved', 'noOpProvenance'].some(key => evidence[key] !== true)
        || runtime?.runtime !== plan.runtime.runtime || runtime?.schema !== 12 || runtime?.actualSchema !== 12
        || runtime?.protocol !== plan.runtime.protocol || runtime?.schemaHash !== plan.runtime.schemaHash) {
      throw new Error('Invalid verification evidence')
    }
    const counts = phase => [...output.matchAll(new RegExp(`^${marker}COUNT_${phase}=(.+)$`, 'gm'))].map(match => {
      const row = JSON.parse(match[1])
      if (!Array.isArray(row) || row.length !== 3 || !['public', 'lingxios'].includes(row[0])
          || typeof row[1] !== 'string' || !Number.isSafeInteger(row[2]) || row[2] < 0) throw new Error('Invalid count evidence')
      return { schema: row[0], table: row[1], count: row[2] }
    })
    const before = counts('BEFORE'), after = counts('AFTER')
    if (!before.length || after.length !== before.length + 4) throw new Error('Incomplete count evidence')
    const key = row => JSON.stringify([row.schema, row.table])
    const oldCounts = new Map(before.map(row => [key(row), row.count]))
    const newCounts = new Map(after.map(row => [key(row), row.count]))
    if (oldCounts.size !== before.length || newCounts.size !== after.length
        || before.some(row => newCounts.get(key(row)) !== row.count + (row.schema === 'public' && row.table === 'schema_migrations' ? 1 : 0))
        || newTables.some(table => oldCounts.has(JSON.stringify(['public', table])) || newCounts.get(JSON.stringify(['public', table])) !== 0)
        || oldCounts.get(JSON.stringify(['public', 'schema_migrations'])) !== 45
        || ['im_ui_revisions', 'im_ui_user_states'].some(table => !oldCounts.has(JSON.stringify(['public', table])))) {
      throw new Error('Invalid count evidence')
    }
    const capacity = [...output.matchAll(/^VISUALIZE_BACKUP_CAPACITY=(.+)$/gm)].map(match => {
      const item = JSON.parse(match[1])
      if (!['initial', 'restore'].includes(item.phase) || ['databaseBytes', 'freeBytes', 'requiredBytes'].some(key => !Number.isSafeInteger(item[key]) || item[key] < 0)
          || item.requiredBytes !== item.databaseBytes * (item.phase === 'initial' ? 2 : 1) + 536870912
          || item.freeBytes < item.requiredBytes) throw new Error('Invalid verification evidence')
      return { phase: item.phase, databaseBytes: item.databaseBytes, freeBytes: item.freeBytes, requiredBytes: item.requiredBytes }
    })
    if (capacity.length !== 2 || capacity[0].phase !== 'initial' || capacity[1].phase !== 'restore') throw new Error('Invalid verification evidence')
    return { updateId, sha: plan.sha, attempt: plan.attempt, backupDir: plan.backupDir,
      isolatedDatabase: plan.isolatedDatabase, isolatedDatabaseRemoved: true, commandHash: plan.commandHash,
      dumpSha256: evidence.dumpSha256, runtime: plan.runtime,
      migration: { version: 46, name: 'visualize', checksum: plan.migrationHash, commitCount: 1 },
      rollback: { countsEqual: true, provenanceEqual: true, catalogEqual: true, catalogSha256: evidence.rollbackCatalogSha256 },
      restoreCountsEqual: true, legacy0033Preserved: true, noOpProvenance: true, capacity, countsBefore: before, countsAfter: after }
  } catch (error) {
    // Never include network exception objects, request headers, response bodies or raw logs.
    const message = error instanceof Error && /^(Komodo HTTP \d+|Verification did not succeed(?: at [a-z-]+)?|Invalid verification evidence|Invalid count evidence|Incomplete count evidence)$/.test(error.message)
      ? error.message : 'Operation outcome uncertain; inspect the Komodo update before retrying'
    throw new Error(`${message}; updateId=${updateId ?? 'unknown'}; attempt=${plan.attempt}; isolatedDatabase=${plan.isolatedDatabase}`)
  }
}

async function main() {
  const args = process.argv.slice(2)
  const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1] }
  if (args.includes('--help')) {
    console.log('Local review: node scripts/verify-visualize-backup.mjs --plan --sha <40-hex> --attempt <unique-id> --output <new-plan.json>\nRelease owner only: same arguments with --execute instead of --plan and a new evidence --output path. Credentials must be injected by Sigillo as KOMODO_API_KEY and KOMODO_API_SECRET. The fixed production API origin is used when KOMODO_WEBHOOK_URL is absent; no webhook is invoked. Never source credentials from a file.')
    return
  }
  if (args.includes('--plan') === args.includes('--execute')) throw new Error('Choose exactly one of --plan or --execute')
  const output = value('--output')
  if (!output) throw new Error('An exclusive new --output path is required')
  const plan = await buildVisualizeBackupPlan({ sha: value('--sha'), attempt: value('--attempt') })
  if (args.includes('--plan')) {
    await writeFile(resolve(root, output), `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ mode: 'plan-only', sha: plan.sha, attempt: plan.attempt, commandHash: plan.commandHash,
      migrationHash: plan.migrationHash, runtime: plan.runtime }))
    return
  }
  const url = process.env.KOMODO_WEBHOOK_URL || 'https://ops.christmas1314.xyz', key = process.env.KOMODO_API_KEY, secret = process.env.KOMODO_API_SECRET
  if (!url || !key || !secret) throw new Error('Sigillo-injected Komodo environment is required')
  // Reserve the evidence destination before issuing the mutating remote request.
  // A remaining pending file is explicitly not a successful verification.
  await writeFile(resolve(root, output), `${JSON.stringify({ status: 'pending', sha: plan.sha, attempt: plan.attempt,
    isolatedDatabase: plan.isolatedDatabase, commandHash: plan.commandHash })}\n`, { flag: 'wx', mode: 0o600 })
  const evidence = await verifyVisualizeBackup({ url,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'x-api-secret': secret }, plan })
  await writeFile(resolve(root, output), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
  console.log(JSON.stringify(evidence))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Validation errors contain fixed wording/validated identifiers only. File errors
    // may contain caller paths; do not print their operating-system diagnostics.
    console.error(error?.code ? 'Backup preparation or evidence write failed; inspect the chosen output path' : error.message)
    process.exitCode = 1
  })
}
