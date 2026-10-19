import {writeFile,readFile} from 'node:fs/promises'
const origin='https://ops.christmas1314.xyz'
const output='/workspace/worktrees/issue193/docs/evidence/issue-193/komodo-b-recovery.json'
const headers={'content-type':'application/json','x-api-key':process.env.KOMODO_API_KEY,'x-api-secret':process.env.KOMODO_API_SECRET}
async function request(path,body){const r=await fetch(origin+path,{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json()}
const previous=await request('/read/GetUpdate',{id:'6ad62712e06d5e1f79832a4d'})
if(previous.status!=='Complete'||previous.success!==false)throw Error('Previous B action is not a confirmed terminal failure')
const failedLogs=(previous.logs??[]).filter(l=>l.success===false).map(l=>(l.stdout??'')+'\n'+(l.stderr??''))
if(!failedLogs.some(s=>s.includes('522')&&s.includes('accel.way2api.fun')&&s.includes('failed to copy')))throw Error('Expected diagnosed image transport failure not confirmed')
const state=await request('/read/GetStackActionState',{stack:'lingxiloop-app-b'})
if(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].some(k=>state[k]!==false))throw Error('B stack is active or action state is incomplete')
const sql=JSON.parse(await readFile('/workspace/worktrees/issue193/docs/evidence/issue-193/production-database-46.json','utf8'))
if(sql.status!=='passed'||sql.product_schema!==46||sql.runtime.actualSchema!==12)throw Error('Migration state not qualified')
const startedAt=new Date().toISOString()
let report={status:'pending',startedAt,operation:'DeployStack',stack:'lingxiloop-app-b',sourceCommit:'bc6dd87d203496580914069d4854f8958692a196',manifestCommit:'9b1bf3ac5f8acfe318b2444ea540d669269fb8c8',previousFailedUpdate:'6ad62712e06d5e1f79832a4d',previousFailure:'Existing configured mirror returned HTTP 522 while copying an image layer; no new B container was created.',schemaBeforeRecovery:46,scope:'Retry only failed B stack through Komodo; no stop/restart/deploy of A, no config/provider/TLS changes.'}
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
let u=await request('/execute/DeployStack',{stack:'lingxiloop-app-b'})
const id=u._id?.$oid
if(!/^[a-f0-9]{24}$/.test(id??''))throw Error('Recovery response missing update ID; check outcome before any retry')
report={...report,updateId:id};await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(`B recovery update ${id}`)
for(let attempt=0;attempt<180&&u.status!=='Complete';attempt++){await new Promise(resolve=>setTimeout(resolve,10000));u=await request('/read/GetUpdate',{id})}
report={...report,status:u.status==='Complete'&&u.success===true?'passed':u.status==='Complete'?'failed':'uncertain',komodoStatus:u.status,komodoSuccess:u.success,startTs:u.start_ts,endTs:u.end_ts,observedAt:new Date().toISOString()}
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1
