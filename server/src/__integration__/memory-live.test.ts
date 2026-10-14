import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { env } from '../env.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { ensureTeacherAgentForCourse } from '../modules/learning/teacher-agent-application.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Live failures: teacher still refuses memory, a claimed write is not durable,
// the next turn forgets the fact, private tool data leaks, or usage is unmetered.
test('live teacher saves and recalls a checked preference without memory UI', {
  skip: process.env.LINGXIOS_LIVE_MEMORY !== '1',timeout: 360000,
}, async () => {
  assert.equal(new URL(env.DATABASE_URL).pathname,'/lingxiloop_release_memory_model_test')
  await ensureSchemaOnce(); await resetAllTables()
  const recording = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const { companyId,projectId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner',companyId)
    await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES('memory-live-course',$1,$2,'test-owner')`,[companyId,projectId])
    const teacher = await ensureTeacherAgentForCourse(companyId,'memory-live-course',pool,run => withTransaction(pool,run))
    const app = await lingxiOSControl(),policy = await syncConversationPolicy(app,companyId,teacher.roomId)
    worker = createWorker({ controlPlane: app,policy: new ProductRuntimePolicy(),worker: { id: 'memory-live' },
      model: { id: env.OPENAI_MODEL,apiKey: env.OPENAI_API_KEY,baseUrl: env.OPENAI_BASE_URL,maxThinkingTokens: 0,
        capabilities: { parallelTools: false } } })
    const actions: string[] = []
    async function turn(messageId: string,text: string) {
      const accepted = await app.conversations.ingest({ tenantId: companyId,conversationId: teacher.roomId,policyVersion: policy.version,
        messageId,version: 1,author: { id: 'test-owner',kind: 'human' },text,mentions: [teacher.agentId] },
      { mode: 'execute',executionClass: 'conversation',codeExecution: 'disabled' })
      const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool,run,teacher.roomId)
      assert.equal(await worker!.runNext(),true)
      const message = await app.readMessage(run); assert.ok(message,'turn must commit a reply')
      assert.ok(!/memory[._]|记忆摘要|记忆已更新|已记住\s*\d+\s*条/.test(message.body),'reply must not expose memory internals')
      const projection = await readRunProjection(app,run,true)
      assert.equal(projection.snapshot.message.metadata.custom.memory,undefined)
      assert.ok(projection.snapshot.message.content.every(part => part.type !== 'tool-call' || !/^memory(?:\.|__)/.test(part.toolName)))
      for (const event of (await app.readEvents(run,0)).events) if (event.kind === 'tool.started') actions.push(String(event.data.name))
      return { run,message }
    }
    const saved = await turn('remember-teacher-preference','请记住我的长期工作偏好：教师简报必须先给出三个要点，再给出待办事项。保存成功后简短确认，不要展示记忆内容。这条确认要求只适用于本次回复。')
    assert.ok(actions.includes('memory.apply'),'the real teacher must call the native write tool')
    const identity = { ...saved.run,workId: saved.run.runId },scopes = await app.memory!.scopes(identity)
    const entries = (await Promise.all(scopes.map(scope => app.memory!.list(identity,scope)))).flatMap(page => page.items)
    assert.ok(entries.length > 0,'preference must be durable')
    const recalled = await turn('recall-teacher-preference','现在开始新的任务：按我的长期格式偏好，实际撰写当前课程的一份简短教师简报。请给出简报正文，不要重复上一轮的确认，也不要讲述内部处理过程。')
    assert.ok(/待办/.test(recalled.message.body),'recall must preserve the requested action-items section')
    assert.ok(/(?:1[.、]|一[、是]|[①])/.test(recalled.message.body),'recall must preserve the requested numbered structure')
    const usage = (await pool.query(`SELECT count(*)::int AS calls,COALESCE(bool_and(measured),false) AS measured,
      COALESCE(sum(cost_usd),0)::text AS cost FROM llm_calls WHERE company_id=$1`,[companyId])).rows[0]
    assert.ok(usage.calls >= 2 && usage.measured && Number(usage.cost) <= 0.4)
    await mkdir('artifacts/memory/live',{ recursive: true })
    await writeFile('artifacts/memory/live/model-results.json',JSON.stringify({ passed: true,model: env.OPENAI_MODEL,
      savedDocuments: entries.length,actions,recallVerified: true,privateProjection: true,usage,
      reproduce: 'node e2e/server/memory-regression.mjs --live-memory' },null,2))
  } finally { await worker?.stop(); await recording.close(); await teardownAll() }
})
