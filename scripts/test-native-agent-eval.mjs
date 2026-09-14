import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { register } from 'tsx/esm/api'
import { createLingxiOS } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'

const url=process.env.LINGXIOS_NATIVE_TEST_DATABASE_URL
assert.ok(url && /^native_/.test(new URL(url).pathname.slice(1)),'requires an empty disposable database named native_*')
Object.assign(process.env,{ DATABASE_URL: url,OPENAI_API_KEY: 'native-eval-fixture',OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  WUKONG_USER_TOKEN_SECRET: 'native-eval-fixture',REDIS_URL: process.env.LINGXIOS_NATIVE_TEST_REDIS_URL ?? 'redis://127.0.0.1:56063',
  R2_ENDPOINT: 'http://127.0.0.1:1',R2_BUCKET: 'native-eval',R2_ACCESS_KEY_ID: 'native-eval',R2_SECRET_ACCESS_KEY: 'native-eval',
  R2_PUBLIC_BASE: 'https://assets.test.invalid',R2_URL_SIGNING_SECRET: 'native-eval-signing-secret',LINGXILOOP_INVITE_BASE_URL: 'https://app.test.invalid' })
const db=new Pool({ connectionString: url,max: 8 }),loader=register({ namespace: 'native-eval-fixture' })
const root=await mkdtemp(join(tmpdir(),'lingxios-native-eval-'))
let app,worker
try {
  assert.equal((await db.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows.length,0)
  const { migrateDatabase }=await loader.import('../server/src/db/migrate.ts',import.meta.url)
  await migrateDatabase(db)
  const { createLingxiOSTarget }=await loader.import('../eval/targets/agent-os.ts',import.meta.url)
  app=await createLingxiOS({ database: db,homesRoot: root,modelBudget: { inputCostMicrosPerMillion: 1_000_000,outputCostMicrosPerMillion: 2_000_000 } })
  let mode='measured',started
  worker=createWorker({ controlPlane: app,kernel: { homesRoot: root },worker: { id: 'native-eval-fixture' },model: {
    modelId: 'native-eval-fixture',contextWindowTokens: 200000,
    async run(request) {
      if(mode==='cancel') {
        started()
        assert.ok(request.signal)
        await new Promise((_resolve,reject)=>{ request.signal.throwIfAborted();request.signal.addEventListener('abort',()=>reject(request.signal.reason),{ once: true }) })
      }
      return { output: [{ role: 'assistant',content: 'Four.' }],text: 'Four.',model: 'native-eval-fixture',
        usage: mode==='unmeasured' ? { available: false,inputTokens: 0,outputTokens: 0 } : { available: true,inputTokens: 100,outputTokens: 10 } }
    },async structured(){return { value: { missing: [] },model: 'native-eval-fixture',usage: { available: true,inputTokens: 10,outputTokens: 5 } }},
    async compact(){throw new Error('bounded fixture must not compact')},
  } })
  const target=createLingxiOSTarget({ app,worker,request: { tenantId: 'eval',agentId: 'agent',principalId: 'principal',threadId: 'thread',mode: 'chat',codeExecution: 'disabled' },configurationFingerprint: 'controlled-native-fixture-v1',usdCny: 7 })
  const sample={ input: 'What is two plus two?',requestId: 'measured',seed: 1,signal: AbortSignal.timeout(30_000) }
  const result=await target.execute(sample)
  assert.equal(result.output,'Four.')
  assert.ok(result.usage.inputTokens>=100);assert.ok(result.usage.outputTokens>=10)
  const identity={ tenantId: 'eval',agentId: 'agent',principalId: 'principal',threadId: 'thread',sessionId: 'eval:measured',runId: 'measured' }
  const usage=await app.readUsage(identity)
  assert.equal(result.usage.costCny,usage.costMicros/1_000_000*7)
  assert.ok(await app.readMessage(identity),'public helper preserves principal and thread for observed output')
  assert.equal(await app.readRun({ ...identity,principalId: 'other' }),null)
  for (const mismatch of [{ principalId: 'other' }, { threadId: 'other' }]) {
    assert.equal(await app.readMessage({ ...identity,...mismatch }),null)
  }
  mode='unmeasured'
  await assert.rejects(target.execute({ ...sample,requestId: 'unmeasured' }),/native_usage_unavailable/)
  mode='cancel'
  const controller=new AbortController(),entered=new Promise(resolve=>{ started=resolve })
  const pending=target.execute({ ...sample,requestId: 'cancel',signal: AbortSignal.any([controller.signal,AbortSignal.timeout(30_000)]) })
  await entered;controller.abort(new DOMException('cancelled','AbortError'))
  await assert.rejects(pending,/cancel|abort/i)
  assert.equal((await app.readRun({ ...identity,sessionId: 'eval:cancel',runId: 'cancel' })).status,'cancelled')
  console.log('Native Eval: actual public executeRequest/Worker, principal/thread identity, measured usage conversion, unknown usage rejection and cancellation passed. This is infrastructure verification, not a quality baseline.')
} finally {
  await worker?.stop();await app?.stop()
  const { closeDatabasePools }=await loader.import('../server/src/db/pool.ts',import.meta.url)
  await closeDatabasePools();await db.end();loader.unregister();await rm(root,{ recursive: true,force: true })
}
