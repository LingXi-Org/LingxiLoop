import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const source='/workspace/LingxiLoop-acceptance/.e2e/image-acceptance/soak'
const worktree='/workspace/LingxiLoop-soak',branch='codex/runtime-soak-evidence'
const relative='docs/evidence/runtime-measurements/soak',destination=`${worktree}/${relative}`
const command=(bin,args)=>{
  // The executor's CLI identity can expire before this observation completes.
  // Reuse only the already-injected package identity, also authorized for this
  // repository; never persist a credential or mint/expand one for the watcher.
  const env=bin==='gh'&&process.env.NODE_AUTH_TOKEN?{...process.env,GH_TOKEN:process.env.NODE_AUTH_TOKEN}:process.env
  const r=spawnSync(bin,args,{cwd:worktree,env,encoding:'utf8',timeout:45000})
  assert.equal(r.status,0,`${bin} ${args[0]} failed (${r.status})`);return r.stdout.trim()
}
assert.equal(command('git',['branch','--show-current']),branch)
mkdirSync(destination,{recursive:true})
let lastPush=0,publishedState='',failures=0
for(;;) {
  const state=JSON.parse(readFileSync(`${source}/state.json`,'utf8'))
  const terminal=existsSync(`${source}/terminal-receipt.json`)
  const stale=state.lastHeartbeatAt&&Date.now()-Date.parse(state.lastHeartbeatAt)>10*60000
  if(!lastPush||Date.now()-lastPush>=3600000||terminal||stale||state.status!=='running') {
    try {
      for(const file of ['state.json','heartbeats.jsonl','terminal-receipt.json']) if(existsSync(`${source}/${file}`))copyFileSync(`${source}/${file}`,`${destination}/${file}`)
      writeFileSync(`${destination}/handoff.json`,JSON.stringify({capturedAt:new Date().toISOString(),source,monitorPid:285092,watcherPid:process.pid,
        monitorLog:'/tmp/acceptance-soak.log',watcherLog:'/tmp/acceptance-soak-watch.log',branch,
        checkpointCadence:'Initial, hourly and terminal; no CI/main merge/deploy is triggered.',
        staleHeartbeat:Boolean(stale),completionRule:'Require terminal-receipt.json, elapsedSeconds >= 86400, intact heartbeat continuity and zero violations. Scope is Web/API only.',
        inspectCommand:'cat /workspace/LingxiLoop-acceptance/.e2e/image-acceptance/soak/state.json',
        heartbeatCommand:'tail -n 3 /workspace/LingxiLoop-acceptance/.e2e/image-acceptance/soak/heartbeats.jsonl',
        processCommand:'ps -p 285092 -o pid,etime,args',
        containerCommand:'docker inspect lingxiloop-acceptance-candidate --format "{{json .State}} {{.RestartCount}}"',
        limitations:['No production Worker: bubblewrap cannot create user namespace in this executor.','No live provider or production rollout qualification.','A disappeared executor or stale evidence does not become a pass.'],
      },null,2))
      command('git',['add',relative])
      command('git',['commit','-m',`docs: checkpoint isolated Web API soak (${Math.floor(state.elapsedSeconds)}s, ${state.status})`])
      command('git',['push','-u','origin',branch])
      lastPush=Date.now();publishedState=state.status
      console.log(JSON.stringify({at:new Date().toISOString(),event:'checkpoint-pushed',elapsedSeconds:state.elapsedSeconds,status:state.status,stale:Boolean(stale)}))
      if(terminal||stale||state.status!=='running') {
        const body=`隔离 Web/API soak 跟进：${stale?'心跳已过期，验收未完成':state.status}；实际记录 ${Math.floor(state.elapsedSeconds)} 秒、${state.samples} 次心跳。\n\n持久证据：https://github.com/LingXi-Org/LingxiLoop/tree/${branch}/${relative}\n\n只有完整 terminal-receipt.json、>=86400秒连续心跳且无violations才构成此有限范围的通过；不包含生产Worker、真实provider或生产部署。`
        const bodyPath=`${source}/followup-comment.md`;writeFileSync(bodyPath,body)
        const url=command('gh',['issue','comment','153','--repo','LingXi-Org/LingxiLoop','--body-file',bodyPath])
        writeFileSync(`${source}/followup-delivery.json`,JSON.stringify({at:new Date().toISOString(),url,publishedState},null,2))
        break
      }
    } catch {failures++;console.error(JSON.stringify({at:new Date().toISOString(),event:'checkpoint-or-followup-failed',failures}));if(failures>=3)process.exit(1)}
  }
  await new Promise(resolve=>setTimeout(resolve,60000))
}
