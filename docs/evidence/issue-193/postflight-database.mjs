import { writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const origin = 'https://ops.christmas1314.xyz'
const output = process.argv[2]
if (!output?.startsWith('/workspace/worktrees/issue193/docs/evidence/issue-193/')) throw new Error('An owned absolute evidence path is required')
if (!process.env.KOMODO_API_KEY || !process.env.KOMODO_API_SECRET) throw new Error('Missing injected Komodo authorization')
const headers = { 'content-type': 'application/json', 'x-api-key': process.env.KOMODO_API_KEY, 'x-api-secret': process.env.KOMODO_API_SECRET }
async function request(path, body) {
  const response = await fetch(origin + path, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(45000) })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}
const sql = `BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT 'VISUALIZE_POSTFLIGHT='||jsonb_build_object(
  'product_schema',(SELECT max(version) FROM public.schema_migrations),
  'migration46',(SELECT jsonb_build_object('version',version,'name',name,'checksum',checksum) FROM public.schema_migrations WHERE version=46),
  'migration33',(SELECT jsonb_build_object('version',version,'name',name,'checksum',checksum) FROM public.schema_migrations WHERE version=33),
  'legacy_tables',(SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename IN ('im_ui_revisions','im_ui_user_states')),
  'legacy_revision_rows',(SELECT count(*) FROM public.im_ui_revisions),
  'legacy_state_rows',(SELECT count(*) FROM public.im_ui_user_states),
  'runtime',(SELECT jsonb_build_object('version',runtime_version,'schema',schema_version,'actualSchema',(SELECT version FROM lingxios.schema_version WHERE singleton),'protocol',protocol_version,'schemaHash',schema_sha256) FROM public.lingxios_installation),
  'visualize_tables',(SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'im_visualize_%')
)::text;
ROLLBACK;`
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'"
const command = 'export PGPASSWORD="$POSTGRES_PASSWORD"\npsql -X -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -c ' + shellQuote(sql)
const expectedChecksum = createHash('sha256').update(await readFile('/workspace/worktrees/issue193/server/src/db/migrations/0046_visualize.sql')).digest('hex')
const expectedLegacyChecksum = createHash('sha256').update(await readFile('/workspace/worktrees/issue193/server/src/db/migrations/0033_interactive_ui.sql')).digest('hex')
const startedAt = new Date().toISOString()
await writeFile(output, JSON.stringify({status:'pending', startedAt, readOnly:true})+'\n', {flag:'wx'})
let update = await request('/execute/RunStackService', {stack:'lingxiloop-core-state',service:'postgres',entrypoint:'sh',command:['-ec',command],user:'postgres',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false})
const id=update._id?.$oid
if (!/^[a-f0-9]{24}$/.test(id??'')) throw new Error('Inspection response has no update ID; check outcome before retry')
console.log(`Read-only schema inspection update ${id}`)
const deadline=Date.now()+180000
while(update.status!=='Complete'&&Date.now()<deadline) {await new Promise(resolve=>setTimeout(resolve,2000));update=await request('/read/GetUpdate',{id})}
if(update.status!=='Complete'||update.success!==true) throw new Error(`Inspection not confirmed successful: ${id} ${update.status}`)
const marker=update.logs.map(log=>log.stdout??'').join('\n').match(/^VISUALIZE_POSTFLIGHT=(.+)$/m)?.[1]
if(!marker) throw new Error(`Inspection marker missing: ${id}`)
const data=JSON.parse(marker)
const checks={legacyMigrationChecksum:data.migration33?.checksum===expectedLegacyChecksum,schema46:data.product_schema===46,migrationChecksum:data.migration46?.checksum===expectedChecksum,
  legacyTables:JSON.stringify(data.legacy_tables)===JSON.stringify(['im_ui_revisions','im_ui_user_states']),
  runtime:data.runtime?.version==='3.5.3'&&data.runtime.schema===12&&data.runtime.actualSchema===12&&data.runtime.protocol===11&&data.runtime.schemaHash==='e8c09fa33af0c073f57effa99aad7beae4f4737dd2966d6584519ec5d4aa1d1a',
  visualizeTables:JSON.stringify(data.visualize_tables)===JSON.stringify(['im_visualize_documents','im_visualize_gestures','im_visualize_pages','im_visualize_states'])}
const status=Object.values(checks).every(Boolean)?'passed':'failed'
const report={status,readOnly:true,startedAt,finishedAt:new Date().toISOString(),updateId:id,komodoStatus:update.status,komodoSuccess:update.success,commandSha256:createHash('sha256').update(command).digest('hex'),checks,...data,limitations:'Counts are current read-only observations, not a transaction spanning the earlier backup or proof that users made no intervening writes.'}
await writeFile(output,JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
if(status!=='passed')process.exitCode=1
