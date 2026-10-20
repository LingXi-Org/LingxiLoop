import {readRunReference} from '@lyyzka/lingxios'
import {pool} from '../db/pool.js'
import {lingxiOSControl,stopLingxiOSControl,prepareLingxiOSWorkerContext} from '../agent-runtime/runtime.js'

// Uses the native public API and the current authenticated product binding.
// No raw prompts, credentials or memory bodies are printed.
const [companyId,principalId,runId,mode='inspect',resumeCursor]=process.argv.slice(2)
if(!companyId || !principalId || !runId || !['inspect','migrate','reindex'].includes(mode)) {
  throw new Error('usage: memory-maintenance <companyId> <principalId> <runId> [inspect|migrate|reindex] [cursor]')
}
try {
  prepareLingxiOSWorkerContext()
  const run=await readRunReference(pool,companyId,runId)
  if(!run || run.principalId!==principalId) throw new Error('memory maintenance run identity is unavailable')
  const identity={...run,principalId,workId:runId},app=await lingxiOSControl(),memory=app.memory!
  if(mode==='reindex') {
    for(const scope of await memory.scopes(identity)) console.log(JSON.stringify({scopeType:scope.scopeType,...await memory.reindex(identity,scope)}))
  } else {
    let cursor:string|undefined=resumeCursor
    for(let page=0;page<200;page++) {
      const result=await memory.migrateLegacy(identity,{dryRun:mode==='inspect',limit:16,...cursor?{cursor}:{}})
      console.log(JSON.stringify(result))
      if(!result.nextCursor) break
      cursor=result.nextCursor
      if(page===199) throw new Error('migration page budget reached; resume with the reported cursor')
    }
  }
} finally {await stopLingxiOSControl();await pool.end()}
