import {readRunReference} from '@lyyzka/lingxios'
import {pool,closeDatabasePools} from '../db/pool.js'
import {redis,sub} from '../redis.js'
import {lingxiOSControl,stopLingxiOSControl,prepareLingxiOSWorkerContext} from '../agent-runtime/runtime.js'

// Uses the native public API and the current authenticated product binding.
// No raw prompts, credentials or memory bodies are printed.
const [companyId,principalId,runId,mode='inspect',resumeCursor,indexLimit,...extra]=process.argv.slice(2)
const cleanupFailures: string[] = []
try {
  if(!companyId || !principalId || !runId || !['inspect','migrate','reindex','index-status','index-reindex'].includes(mode)) {
    throw new Error('usage: memory-maintenance <companyId> <principalId> <runId> [inspect|migrate|reindex|index-status|index-reindex] [cursor|planHash] [maxEligible]')
  }
  prepareLingxiOSWorkerContext()
  const run=await readRunReference(pool,companyId,runId)
  if(!run || run.principalId!==principalId) throw new Error('memory maintenance run identity is unavailable')
  const identity={...run,principalId,workId:runId},app=await lingxiOSControl(),memory=app.memory!
  if(mode==='index-status'||mode==='index-reindex') {
    try {
      if(extra.length||(mode==='index-status'&&(resumeCursor!==undefined||indexLimit!==undefined))
        ||(mode==='index-reindex'&&(!resumeCursor||!indexLimit||!/^\d+$/.test(indexLimit))))throw new Error('invalid native memory index arguments')
      const {memoryEmbeddings}=await import('../modules/memory/configuration.js')
      const {memoryIndexStatus,enqueueMemoryIndex}=await import('../agent-runtime/memory-index-maintenance.js')
      const status=await memoryIndexStatus(memory,identity,memoryEmbeddings())
      console.log(JSON.stringify(mode==='index-status'?status.receipt:
        await enqueueMemoryIndex(memory,identity,status,resumeCursor!,Number(indexLimit),receipt=>console.log(JSON.stringify(receipt)))))
    } catch {throw new Error('native memory index maintenance failed; inspect aggregate receipts before another enqueue')}
  } else if(mode==='reindex') {
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
} finally {
  for(const [name,close] of [
    ['control',stopLingxiOSControl],
    ['subscriber',() => sub.disconnect()],
    ['redis',() => redis.disconnect()],
    ['database',closeDatabasePools],
  ] as const) {
    try {await close()}
    // Cleanup errors can contain connection details; retain fixed stage names only.
    catch {cleanupFailures.push(name)}
  }
}
if(cleanupFailures.length) throw new Error(`memory maintenance cleanup failed: ${cleanupFailures.join(', ')}`)
