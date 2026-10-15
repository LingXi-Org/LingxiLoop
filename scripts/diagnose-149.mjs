// Read-only diagnosis. Never print raw commands, stdout, stderr or environment.
const host = 'https://ops.christmas1314.xyz'
const headers = {'content-type':'application/json','x-api-key':process.env.KOMODO_API_KEY,'x-api-secret':process.env.KOMODO_API_SECRET}
if (!headers['x-api-key'] || !headers['x-api-secret']) throw new Error('Missing Komodo credentials')
async function read(type, body) {
 const r=await fetch(`${host}/read/${type}`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
 if(!r.ok) throw new Error(`${type}: HTTP ${r.status}`)
 return r.json()
}
const signals={
 network:/timeout|timed out|connection refused|could not resolve|unable to access|connection reset|TLS|SSL|502|503|504/i,
 gitDirty:/local changes|untracked working tree|overwritten by|unmerged files|not possible to fast-forward/i,
 missingRef:/couldn't find remote ref|invalid reference|unknown revision|not a git repository/i,
 imagePull:/pull access denied|manifest unknown|failed to resolve reference|failed to copy|image.*not found/i,
 portConflict:/port is already allocated|address already in use/i,
 unhealthy:/unhealthy|healthcheck|did not become healthy/i,
 missingResource:/no such|not found|does not exist/i,
 permission:/permission denied|unauthorized|forbidden/i,
 disk:/no space left|disk quota/i,
 alreadyRunning:/already running|already in progress/i,
}
function safeError(text) {
 let value = text.replace(/\u001b\[[0-9;]*m/g, '')
 for(const key of ['KOMODO_API_KEY','KOMODO_API_SECRET']) value=value.split(process.env[key]).join('[redacted]')
 value=value.replace(/https?:\/\/[^\s"<>]+/g, raw=>{try {const u=new URL(raw);return `${u.protocol}//${u.host}${u.pathname}`}catch{return '[url]'}})
 return value.slice(0,1500)
}
const recent=await read('ListUpdates',{})
for(const item of (recent.updates??[]).slice(0,35)) {
 if(item.start_ts<Date.parse('2026-10-15T17:20:00Z')) continue
 const u=await read('GetUpdate',{id:item.id})
 console.log(JSON.stringify({id:item.id,operation:u.operation,target:u.target,status:u.status,success:u.success,start_ts:u.start_ts,
 logs:(u.logs??[]).map(l=>({stage:l.stage,success:l.success,stdoutBytes:(l.stdout??'').length,stderrBytes:(l.stderr??'').length,
 failureDetails:['Compose Pull','Compose Up'].includes(l.stage) && !l.success ? (l.stderr??'').split('\n').filter(line=>/error|failed|denied|timeout|unexpected status/i.test(line)).map(safeError):[],
 signals:Object.entries(signals).filter(([,p])=>p.test(`${l.stdout??''}\n${l.stderr??''}`)).map(([name])=>name),
 childUpdates:[...new Set((`${l.stdout??''}\n${l.stderr??''}`).match(/\b[0-9a-f]{24}\b/g)??[])],
 }))}))
}
