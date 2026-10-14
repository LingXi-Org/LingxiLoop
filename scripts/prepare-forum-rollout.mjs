// One-time maintenance for migration 0039 through Komodo v2.3.3 public execute/read APIs.
// Secrets remain in Komodo's service environment; only update IDs and backup metadata are logged.
export async function prepareForumRollout({ url, headers }) {
  async function request(path, body) {
    const response = await fetch(new URL(path,url),{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60_000)})
    if (!response.ok) throw new Error(`Komodo ${path} returned ${response.status}`)
    return response.json()
  }
  async function execute(operation,params) {
    let update = await request(`/execute/${operation}`,params)
    const id = update._id?.$oid
    if(!id) throw new Error(`Komodo ${operation} returned no update ID`)
    console.log(`[forum-preflight] ${operation}: ${id}`)
    const deadline=Date.now()+15*60_000
    while(update.status!=='Complete' && Date.now()<deadline) {
      await new Promise(resolve=>setTimeout(resolve,2000))
      update=await request('/read/GetUpdate',{id})
    }
    if(update.status!=='Complete'||!update.success) throw new Error(`Komodo ${operation} did not complete successfully (update ${id})`)
    return update
  }
  const run = command => execute('RunStackService',{stack:'lingxiloop-core-state',service:'postgres',
    entrypoint:'sh',command:['-ec',command],user:'postgres',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false})
  const query = `export PGPASSWORD="$POSTGRES_PASSWORD"
psql -X -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "SELECT 'FORUM_SCHEMA='||COALESCE(MAX(version),0) FROM schema_migrations"`
  const check = await run(query)
  const output=check.logs.map(log=>log.stdout).join('\n')
  const version=Number(/^FORUM_SCHEMA=(\d+)\s*$/m.exec(output)?.[1])
  if(!Number.isInteger(version)||version<38) throw new Error('Forum preflight requires a verified schema 38 or newer')
  if(version>=39) {console.log(`[forum-preflight] schema ${version} already includes forum convergence`);return}
  const stopped=[]
  try {
    // Stop admission on both instances first. Worker SIGTERM gets its configured drain grace.
    for(const services of [['lingxiloop'],['worker']]) for(const stack of ['lingxiloop-app-b','lingxiloop-app-a']) {
      await execute('StopStack',{stack,services,stop_time:150})
      stopped.push({stack,services})
    }
    const sha=process.env.GITHUB_SHA
    if(!/^[a-f0-9]{40}$/.test(sha??'')) throw new Error('A concrete release SHA is required for the backup')
    const backup=await run(`export PGPASSWORD="$POSTGRES_PASSWORD"
umask 077
backup_dir="/var/lib/postgresql/data/forum-upgrade-backups/${sha}"
mkdir -p "$backup_dir"
pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$backup_dir/product.dump"
pg_restore --list "$backup_dir/product.dump" > "$backup_dir/restore-list.txt"
verify_db="forum_restore_${sha.slice(0,16)}"
createdb -h postgres -U "$POSTGRES_USER" "$verify_db"
trap 'dropdb -h postgres -U "$POSTGRES_USER" "$verify_db"' EXIT
pg_restore -h postgres -U "$POSTGRES_USER" -d "$verify_db" --no-owner --no-privileges --exit-on-error "$backup_dir/product.dump"
counts="SELECT (SELECT COUNT(*) FROM learning_activities)||':'||(SELECT COUNT(*) FROM learning_attempts)||':'||(SELECT COUNT(*) FROM learning_evaluations)||':'||(SELECT COUNT(*) FROM course_forum_posts)"
original_counts=$(psql -X -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c "$counts")
restored_counts=$(psql -X -h postgres -U "$POSTGRES_USER" -d "$verify_db" -At -v ON_ERROR_STOP=1 -c "$counts")
test "$original_counts" = "$restored_counts"
sha256sum "$backup_dir/product.dump" > "$backup_dir/sha256.txt"
printf 'FORUM_BACKUP_VERIFIED=%s\\n' "${sha}"
printf 'FORUM_BACKUP_COUNTS=%s\\n' "$restored_counts"
cat "$backup_dir/sha256.txt"`)
    const stdout=backup.logs.map(log=>log.stdout).join('\n')
    if(!stdout.includes(`FORUM_BACKUP_VERIFIED=${sha}`)) throw new Error('Backup restore verification marker missing')
    const counts=/^FORUM_BACKUP_COUNTS=([0-9:]+)$/m.exec(stdout)?.[1]
    const hash=/^([a-f0-9]{64})\s+.*\/product\.dump$/m.exec(stdout)?.[1]
    if(!counts||!hash) throw new Error('Backup count/hash evidence missing')
    console.log(`[forum-preflight] verified restore: ${sha}; assignments:submissions:evaluations:posts=${counts}; sha256=${hash}`)
  } catch(error) {
    // No migration has run: resume old binaries. Do not swallow a recovery failure.
    for(const services of [['lingxiloop'],['worker']]) for(const stack of ['lingxiloop-app-a','lingxiloop-app-b']) {
      if(stopped.some(item=>item.stack===stack&&item.services[0]===services[0])) await execute('StartStack',{stack,services})
    }
    throw error
  }
}
