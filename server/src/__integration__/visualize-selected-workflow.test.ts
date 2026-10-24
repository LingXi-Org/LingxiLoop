import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions, skillIndex } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model written before implementation: docs/evidence/issue-342-selective/FAILURE-MODEL.md.
test('selected visual creation gets one focused review while reads and ordinary answers stay honest', { timeout: 90000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong(), receipts: object[] = []
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent(), principalId = 'test-owner'
    await seedUserMembership(principalId, companyId)
    const api = await lingxiOSControl(), { name, version, hash } = skillIndex(visualizeSkill)
    for (const scenario of ['ordinary', 'read-only', 'create', 'read-reference', 'disabled', 'activated'] as const) {
      const room = `selected-visualize-${scenario}`, members = [principalId, agentId]
      await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [room, companyId, projectId, JSON.stringify(members)])
      await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room, companyId, JSON.stringify({ channelType: 2, members })])
      const policy = await syncConversationPolicy(api, companyId, room)
      const request = scenario === 'ordinary' ? 'Say hello.' : scenario === 'read-only' ? 'Read the visualization documentation and summarize it without creating a view.' : 'Create a small interactive comparison of two invented stages.'
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: room, policyVersion: policy.version,
        messageId: `selected-source-${scenario}`, version: 1, author: { id: principalId, kind: 'human' }, mentions: [agentId], text: request },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      const identity = accepted.runs[0]; assert.ok(identity); await bindProductRun(pool, identity, room)
      let calls = 0, reviews = 0, saves = 0, reads = 0, path = '', reference = ''
      let driverError: unknown
      const usage = { available: true, inputTokens: 100, outputTokens: 20 }
      const options = { controlPlane: api, policy: new ProductRuntimePolicy(), semanticReview: scenario === 'disabled' ? 'disabled' as const : 'selective' as const,
        worker: { id: `selected-visualize-${scenario}`, shutdownGraceMs: 1000 }, modelBudget: { maxModelCalls: 12, maxTokens: 1_000_000, wallClockMs: 30000 },
        model: { modelId: 'synthetic-selected-workflow', contextWindowTokens: 1_000_000,
          async compact() { throw new Error('unexpected compaction') },
          async structured(input: { instructions: string }) {
            reviews++
            assert.notEqual(scenario, 'ordinary', 'ordinary unselected answers use no semantic reviewer')
            assert.notEqual(scenario, 'activated', 'native activation uses deterministic delivery checks')
            assert.notEqual(scenario, 'disabled', 'explicit disabled review performs no model judge')
            assert.match(input.instructions, /visualization|visualize/i)
            const value = scenario === 'read-only' ? { missing: [] }
              : { missing: [{ quote: request, reason: 'The currently requested interactive visualization was not delivered; a promise is not the result.' }] }
            return { value, model: 'synthetic-selected-workflow', usage }
          },
          async run(input: { items: readonly unknown[] }) {
            try {
              const phase = calls++
              const call = (tool: string, args: object) => ({ text: '', output: [{ type: 'function_call' as const, callId: `selected-${scenario}-${calls}`, name: tool, arguments: JSON.stringify(args) }], usage })
              const answer = (text: string) => ({ text, output: [{ role: 'assistant' as const, content: text }], usage })
              if (scenario === 'ordinary') { assert.equal(phase, 0); return answer('Hello.') }
              if (!phase) return scenario === 'activated' ? call('skills__activate', { name, version, hash })
                : scenario === 'read-reference' ? call('visualize__read_reference', { path: 'SKILL.md' }) : call('skills__load', { name, version, hash })
              if (scenario === 'read-only') { assert.equal(phase, 1); return answer('The documentation describes inline interactive views.') }
              if (phase === 1 && scenario !== 'activated') return answer('I will create the interactive comparison.')
              if (phase === (scenario === 'activated' ? 1 : 2)) {
                saves++
                return call('visualize__save', { name: 'two-stages', html: '<div><button type="button" onclick="this.nextElementSibling.hidden=false">Compare</button><p hidden>Gather and Check are invented stages.</p></div>' })
              }
              const outputs = input.items.filter((item): item is { type: string; output: string } => !!item && typeof item === 'object' && 'type' in item && item.type === 'function_call_output')
              const output = outputs.at(-1) ? JSON.parse(outputs.at(-1)!.output) : undefined
              if (phase === (scenario === 'activated' ? 2 : 3)) {
                path = output.value.path; reference = output.value.reference; reads++
                return call('visualize__read', { path })
              }
              if (scenario === 'create' && phase === 4) return answer('Gather collects inputs and Check inspects them.')
              assert.equal(phase, scenario === 'activated' ? 3 : scenario === 'create' ? 5 : 4)
              return answer(`Gather collects inputs and Check inspects them.\n\n${reference}`)
            } catch (error) { driverError = error; throw error }
          } } }
      worker = createWorker(options)
      const signal = AbortSignal.timeout(25000)
      while (!await worker.runNext()) { signal.throwIfAborted(); await delay(10) }
      // A synthetic driver assertion must not be hidden by the delivery wait.
      if (driverError) throw driverError
      let state = await api.readRunState(identity)
      while (state?.delivery === 'pending') {
        if (signal.aborted) throw new Error(`selected workflow delivery wait expired: ${JSON.stringify({ scenario,
          calls, reviews, saves, reads, status: state.run.status, delivery: state.delivery,
          resultPresent: !!state.run.resultId, messagePresent: !!state.message })}`, { cause: signal.reason })
        await delay(10); state = await api.readRunState(identity)
      }
      const activationCount = (await pool.query('SELECT count(*)::int n FROM lingxios.agent_skill_activations WHERE work_id=$1', [identity.runId])).rows[0].n
      const documents = await pool.query('SELECT version FROM im_visualize_documents WHERE run_id=$1', [identity.runId])
      if (scenario === 'disabled') {
        assert.equal(state?.run.status, 'partial'); assert.equal(reviews, 0); assert.equal(saves, 0)
        assert.equal(activationCount, 0); assert.equal(documents.rowCount, 0)
      } else {
        assert.equal(state?.run.status, 'succeeded'); assert.equal(state.delivery, 'delivered')
        assert.equal(reviews, scenario === 'ordinary' || scenario === 'activated' ? 0 : 1)
        assert.equal(saves, scenario === 'ordinary' || scenario === 'read-only' ? 0 : 1)
        assert.equal(reads, saves)
        assert.equal(activationCount, saves)
        assert.deepEqual(documents.rows, saves ? [{ version: 1 }] : [], 'reference-only repair cannot save another version')
        if (saves) assert.ok(state.message?.body.includes(reference))
      }
      receipts.push({ scenario, calls, reviews, saves, reads, activationCount, documents: documents.rowCount, status: state?.run.status, delivery: state?.delivery })
      await worker.stop(); worker = undefined
    }
    await mkdir('artifacts/issue-342-selective', { recursive: true })
    await writeFile('artifacts/issue-342-selective/worker.json', JSON.stringify({ runtime: releaseVersions.runtime,
      syntheticOnly: true, productionRequests: 0, originalCaseVerified: false, publishedWorker: true, realPostgres: true, receipts }, null, 2) + '\n')
  } finally { await worker?.stop(); await teardownAll(); await im.close() }
})
