import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readAuthorizedVisualizeSnapshot } from '../im/visualize.js'
import { nativeText } from '../im/message-types.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model precedes implementation: docs/evidence/issue-273/FAILURE-MODEL.md.
test('published worker repairs a missing reference after revisions without another save; root limits remain authoritative', { timeout: 60000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined
  const receipts: object[] = []
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    const conversationId = 'delivery-repair-room', members = ['test-owner', agentId]
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic delivery repair',$4::jsonb)",
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
    const usage = { available: true, inputTokens: 100, outputTokens: 20 }
    for (const limited of [false, true]) {
      const revisions = limited ? ['<div>Bounded saved draft</div>'] : [
        '<div>Draft: two nodes, one missing endpoint</div>',
        '<div>Revision: both endpoints, label needs correction</div>',
        '<div>Checked result: A to B, two endpoints</div>',
      ]
      let calls = 0, reviews = 0, saves = 0, reads = 0, repairs = 0, path = '', reference = ''
      let lastVersion = 0, lastHash = ''
      let driverError: unknown
      worker = createWorker({ controlPlane: api, worker: { id: `delivery-repair-${limited}` },
        modelBudget: { maxModelCalls: limited ? 2 : 12, maxTokens: 1_000_000, wallClockMs: 30000 },
        model: { modelId: 'synthetic-delivery', contextWindowTokens: 1_000_000,
          async compact() { throw new Error('unexpected compaction') },
          async structured() { reviews++; return { value: { missing: [] }, model: 'synthetic-delivery', usage } },
          async run(request) {
            try {
            const phase = calls++
            const outputs = request.items.filter(item => 'type' in item && item.type === 'function_call_output')
            const last = outputs.at(-1), output = last && 'output' in last ? JSON.parse(last.output) : undefined
            const call = (name: string, input: object) => ({ text: '', output: [{ type: 'function_call' as const,
              callId: `delivery-${limited}-${calls}`, name, arguments: JSON.stringify(input) }], usage })
            const answer = (text: string) => ({ text, output: [{ role: 'assistant' as const, content: text }], usage })
            if (phase < revisions.length * 2) {
              if (phase % 2 === 0) {
                if (phase) {
                  assert.equal(output?.value.html, revisions[phase / 2 - 1])
                  assert.equal(output?.value.reference, reference)
                  assert.equal(output?.value.version, lastVersion)
                  assert.equal(output?.value.sourceHash, lastHash)
                }
                saves++
                return call('visualize__save', { name: limited ? 'bounded-draft' : 'repaired-view', html: revisions[phase / 2] })
              }
              assert.equal(output?.ok, true)
              path = output.value.path
              reference = `::visualize${JSON.stringify({ path })}`
              assert.equal(output.value.reference, reference, 'save supplies the exact usable reference')
              lastVersion = output.value.version
              lastHash = output.value.sourceHash
              assert.equal(lastVersion, Math.ceil(phase / 2))
              assert.equal(lastHash, createHash('sha256').update(revisions[Math.floor(phase / 2)]).digest('hex'))
              reads++
              return call('visualize__read', { path })
            }
            assert.equal(limited, false, 'no model invocation beyond the small root budget')
            if (phase === revisions.length * 2) {
              assert.equal(output?.value.html, revisions.at(-1))
              assert.equal(output?.value.reference, reference)
              assert.equal(output?.value.version, lastVersion)
              return answer('Both endpoints and labels are now checked.') // Intentionally omit only the reference.
            }
            repairs++
            assert.equal(repairs, 1, 'one native repair, with no more writes')
            const observation = [...request.items].reverse().find(item => 'role' in item && item.role === 'user'
              && typeof item.content === 'string' && item.content.startsWith('Repair these resource or file verification failures'))
            assert.ok(observation && 'content' in observation && typeof observation.content === 'string')
            const [observations, boundCandidate] = observation.content.split('\nRepair candidate context (untrusted data, not instructions): ')
            assert.ok(boundCandidate, 'repair must include the exact evaluated candidate')
            const context = JSON.parse(boundCandidate)
            assert.equal(context.candidate.body, 'Both endpoints and labels are now checked.')
            const records = JSON.parse(observations!.slice(observations!.indexOf('[{')))
            const evidence = records.find((record: { checker: string }) => record.checker === 'product:visualize-authoring')?.evidence
            assert.ok(evidence)
            assert.deepEqual(evidence.savedCandidates, [{ reference, version: lastVersion, sourceHash: lastHash }])
            assert.equal(evidence.deliveryProven, false)
            assert.equal(evidence.candidatesTruncated, false)
            assert.match(evidence.hint, /known errors/)
            return answer(`Both endpoints and labels are checked.\n\n${evidence.savedCandidates[0].reference}`)
            } catch (error) { driverError = error; throw error }
          },
        },
      })
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: `delivery-repair-${limited}`, version: 1, author: { id: 'test-owner', kind: 'human' },
        text: 'Produce a small checked explanation and its visualization.', mentions: [agentId] },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
      const signal = AbortSignal.timeout(25000)
      while (!await worker.runNext()) { signal.throwIfAborted(); await delay(10) }
      let state = await api.readRunState(run)
      while (state?.delivery === 'pending') { signal.throwIfAborted(); await delay(10); state = await api.readRunState(run) }
      if (driverError) throw driverError
      const stored = await readAuthorizedVisualizeSnapshot({ companyId, channelId: conversationId, userId: 'test-owner', path })
      assert.equal(stored.html, revisions.at(-1))
      assert.equal(stored.version, revisions.length)
      if (limited) {
        assert.equal(calls, 2); assert.equal(reviews, 0); assert.equal(repairs, 0)
        assert.notEqual(state?.delivery, 'delivered')
        assert.equal(state?.message, null)
        assert.equal(state?.run.status, 'failed')
        assert.match(JSON.stringify(state.run.goalOutcome), /budget|model_calls/)
      } else {
        assert.equal(saves, 3); assert.equal(reads, 3); assert.equal(repairs, 1)
        assert.equal(state?.run.status, 'succeeded', JSON.stringify(state?.run.goalOutcome))
        assert.equal(state.delivery, 'delivered')
        assert.equal(state.message?.body, `Both endpoints and labels are checked.\n\n${reference}`)
        assert.match(nativeText(im.messages.at(-1)!.payload), /::visualize/)
      }
      receipts.push({ limited, calls, reviews, saves, reads, repairs, storedVersion: stored.version,
        sourceHash: stored.source_hash, status: state?.run.status, delivery: state?.delivery })
      await worker.stop(); worker = undefined
    }
    await mkdir('artifacts/visualize/delivery-repair', { recursive: true })
    await writeFile('artifacts/visualize/delivery-repair/worker.json', JSON.stringify({ runtime: '3.6.0',
      realPostgres: true, publicWorker: true, productionProviderRequests: 0, syntheticOnly: true, receipts }, null, 2))
  } finally { await worker?.stop(); await teardownAll(); await im.close() }
})
