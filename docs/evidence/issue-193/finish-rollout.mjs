import {readFile,writeFile} from 'node:fs/promises'
import {prepareForumRollout} from '/workspace/worktrees/issue193/scripts/prepare-forum-rollout.mjs'
const output='/workspace/worktrees/issue193/docs/evidence/issue-193/komodo-final-stages.json'
const recovery=JSON.parse(await readFile('/workspace/worktrees/issue193/docs/evidence/issue-193/komodo-b-recovery.json','utf8'))
if(recovery.status!=='passed'||recovery.komodoStatus!=='Complete'||recovery.komodoSuccess!==true)throw Error('B recovery is not confirmed successful')
const url=new URL('https://ops.christmas1314.xyz')
const headers={'content-type':'application/json','x-api-key':process.env.KOMODO_API_KEY,'x-api-secret':process.env.KOMODO_API_SECRET}
async function request(path,body){const r=await fetch(new URL(path,url),{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json()}
const state=await request('/read/GetStackActionState',{stack:'uptime'})
if(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].some(k=>state[k]!==false))throw Error('Uptime has an active or unknown action')
let report={status:'pending',startedAt:new Date().toISOString(),resumesAfter:'6ad62996e06d5e1f79832ad0',scope:'Complete only the remaining Uptime stage and original forum read-only postflight; no stop/restart/deploy of A or B.'}
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'})
let u=await request('/execute/DeployStack',{stack:'uptime'})
const id=u._id?.$oid
if(!/^[a-f0-9]{24}$/.test(id??''))throw Error('Uptime response has no update ID; check outcome before retry')
report={...report,uptimeUpdate:id};await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(`Final Uptime stage update ${id}`)
for(let attempt=0;attempt<90&&u.status!=='Complete';attempt++){await new Promise(resolve=>setTimeout(resolve,2000));u=await request('/read/GetUpdate',{id})}
report.uptime={komodoStatus:u.status,komodoSuccess:u.success,startTs:u.start_ts,endTs:u.end_ts}
await writeFile(output,JSON.stringify(report,null,2)+'\n')
if(u.status!=='Complete'||u.success!==true)throw Error('Final Uptime stage not confirmed successful')
const lines=[];const originalLog=console.log
console.log=(...args)=>{lines.push(args.join(' '));originalLog(...args)}
try{await prepareForumRollout({url,headers,verifyOnly:true})}finally{console.log=originalLog}
const result=lines.find(line=>line.startsWith('[forum-postflight] '))
if(!result)throw Error('Original postflight marker missing')
report={...report,status:'passed',completedAt:new Date().toISOString(),forumVerification:JSON.parse(result.slice('[forum-postflight] '.length)),forumReadOnlyUpdates:lines.map(line=>/RunStackService: ([a-f0-9]{24})/.exec(line)?.[1]).filter(Boolean)}
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
