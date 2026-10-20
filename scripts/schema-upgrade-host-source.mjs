// Komodo native files_on_host, in the existing inline checkout directory.
// Only raw tracked Compose hashes leave this module; never remote file contents.
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {isDeepStrictEqual as equal} from 'node:util'
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url))
const STACKS=['lingxiloop-app-a','lingxiloop-app-b','lingxiloop-core-state']
const ACTIONS=['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying']
const check=(ok,message)=>{if(!ok)throw Error(message)}
const digest=value=>createHash('sha256').update(value).digest('hex')
const serverFor=stack=>stack==='lingxiloop-app-b'?'shanghai-b':'shanghai-a'
const validBranch=branch=>typeof branch==='string'&&/^release\/[a-z0-9][a-z0-9._-]{0,95}$/.test(branch)&&!branch.includes('..')&&!branch.endsWith('.')&&!branch.endsWith('.lock')
export async function deriveHostSource({pinCommit,branch}) {
 check(/^[a-f0-9]{40}$/.test(pinCommit??'')&&validBranch(branch),'Exact manifest commit and fixed release branch required')
 const stacks=[]
 for(const stack of STACKS){
  const {stdout}=await run('git',['show',`${pinCommit}:deploy/komodo/${stack}/compose.yml`],{cwd:root,encoding:'buffer',maxBuffer:1024*1024})
  stacks.push({stack,server:serverFor(stack),sha256:digest(stdout)})
 }
 return {mode:'host',branch,stacks}
}
function validateDescriptor(plan) {
 const d=plan?.hostSource
 check(plan?.format===2&&/^[a-f0-9]{40}$/.test(plan.pinCommit??'')&&d?.mode==='host'&&validBranch(d.branch)
  &&equal(Object.keys(d).sort(),['branch','mode','stacks'])&&Array.isArray(d.stacks)&&d.stacks.length===3,'Verified host-source plan required')
 for(const [i,row] of d.stacks.entries())check(equal(Object.keys(row).sort(),['server','sha256','stack'])
  &&row.stack===STACKS[i]&&row.server===serverFor(row.stack)&&/^[a-f0-9]{64}$/.test(row.sha256??''),'Invalid host-source descriptor')
 return d
}
function assertConfig(details,stack,plan,serverId) {
 const c=details?.config,emptyHook={path:'',command:'',shell_mode:false}
 check(/^[a-f0-9]{24}$/.test(details?._id?.$oid??'')&&c&&c.server_id===serverId&&c.swarm_id===''&&c.repo==='LingXi-Org/LingxiLoop'&&c.branch===plan.hostSource.branch
  &&c.commit===plan.pinCommit&&c.files_on_host===true&&c.reclone===false&&c.clone_path===''&&c.git_account===''&&c.registry_account===''
  &&c.linked_repo===''&&c.file_contents===''&&c.run_directory===`deploy/komodo/${stack}`&&c.env_file_path==='.env'
  &&equal(c.file_paths,['compose.yml'])&&equal(c.additional_env_files,[])&&equal(c.config_files,[])
  &&c.auto_update===false&&c.auto_update_all_services===false&&c.poll_for_updates===false
  &&c.run_build===false&&c.destroy_before_deploy===false&&c.project_name===''&&c.compose_cmd_wrapper===''
  &&equal(c.extra_args,[])&&equal(c.build_extra_args,[])&&equal(c.pre_deploy,emptyHook)&&equal(c.post_deploy,emptyHook)
  &&equal(c.ignore_services,stack==='lingxiloop-core-state'?[]:['db-migrate']),'Frozen stack source/configuration drift')
}
export async function verifyHostSource({plan,transport,stacks=STACKS,onProgress=async()=>{}}) {
 const descriptor=validateDescriptor(plan)
 check(Array.isArray(stacks)&&stacks.length>0&&new Set(stacks).size===stacks.length&&stacks.every(s=>STACKS.includes(s)),'Unexpected source verification scope')
 check((await transport.read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running===false,'Concurrent rollout procedure')
 async function host(stack) {
  const servers=await transport.read('ListServers',{})
  const rows=Array.isArray(servers)?servers.filter(s=>s.name===serverFor(stack)):[]
  check(rows.length===1&&rows[0].info?.state==='Ok'&&/^[a-f0-9]{24}$/.test(rows[0].id??''),'Host unavailable for fresh source proof')
  return rows[0].id
 }
 for(const stack of stacks){
  const started=performance.now(),serverId=await host(stack)
  const action=await transport.read('GetStackActionState',{stack})
  check(ACTIONS.every(k=>action[k]===false),'Concurrent stack action')
  const before=await transport.read('GetStack',{stack});assertConfig(before,stack,plan,serverId)
  await transport.refreshStackCache(stack)
  const after=await transport.read('GetStack',{stack})
  check(await host(stack)===serverId,'Host identity changed during source proof')
  assertConfig(after,stack,plan,serverId)
  check(after._id?.$oid===before._id?.$oid&&equal(after.config,before.config),'Stack changed during source proof')
  const info=after.info,files=info?.remote_contents
  check(equal(info?.remote_errors,[])&&equal(info?.missing_files,[])&&Array.isArray(files)&&files.length===1
   &&files[0].path==='compose.yml'&&typeof files[0].contents==='string','Fresh host files unavailable or ambiguous')
  const expected=descriptor.stacks.find(s=>s.stack===stack),actual=digest(files[0].contents)
  check(actual===expected.sha256,'Actual host Compose differs from qualified manifest')
  await onProgress({phase:'host-source',status:'verified',stack,server:expected.server,sha256:actual,durationMs:Math.round(performance.now()-started)})
 }
}
