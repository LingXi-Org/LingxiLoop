import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { skillIndex } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { readVisualizeReference, visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { nativeText } from '../im/message-types.js'
import { readAuthorizedVisualizeDocument } from '../im/visualize.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model is recorded in artifacts/visualize/runtime/failure-model.md before runtime edits.
test('published native worker loads unchanged skill, saves and reads a scoped fragment, delivers its reference and exports actual HTML', { timeout: 300000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    await pool.query("UPDATE participants SET capabilities='[]'::jsonb WHERE company_id=$1 AND id=$2", [companyId, agentId])
    const conversationId = 'visualize-runtime-room', members = ['test-owner', agentId]
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Visualize runtime',$4::jsonb)",
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
    const usage = { available: true, inputTokens: 100, outputTokens: 20 }
    const html = '<div id="native-fixture"><label for="value">Value</label><input id="value" type="range" min="1" max="10" value="3"><output>3</output></div>\n<script>document.getElementById("value").oninput=(e)=>{document.querySelector("#native-fixture output").textContent=e.target.value}</script>'
    let phase = 0, calls = 0, path = '', exporting = false, omittedReference = false
    let observation: { actionKey: string; sha256: string; text: string } | undefined
    let completeSkillRead = false
    let maxRangeResponseCharacters = 0, consumedSkillSha256 = ''
    worker = createWorker({ controlPlane: api, worker: { id: 'visualize-generation-fixture' },
      model: { modelId: 'visualize-fixture', contextWindowTokens: 1000000, async compact() { throw new Error('unexpected compaction') },
        async structured() { return { value: { missing: [] }, model: 'visualize-fixture', usage } },
        async run(request) {
          calls++
          const names = request.tools?.map(tool => tool.name) ?? []
          assert.ok(names.includes('visualize__save')); assert.ok(names.includes('skills__load'))
          const outputs = request.items.filter(item => 'type' in item && item.type === 'function_call_output')
          const last = outputs.at(-1), output = last && 'output' in last ? JSON.parse(last.output) : undefined
          let result = output
          const call = (name: string, input: object) => ({ text: '', output: [{ type: 'function_call' as const, callId: `call-${calls}`, name, arguments: JSON.stringify(input) }], usage })
          const answer = (text: string) => ({ text, output: [{ role: 'assistant' as const, content: text }], usage })
          if (output?.truncated) {
            assert.equal(observation, undefined, 'a 4000-character observation range must remain untruncated')
            assert.ok(names.includes('observations__read'))
            const ref = output.observations?.[0]; assert.ok(ref, 'truncated results must retain their authorized observation reference')
            observation = { actionKey: ref.actionKey, sha256: ref.sha256, text: '' }
            return call('observations__read', { actionKey: ref.actionKey, sha256: ref.sha256, start: 0, length: 4000 })
          }
          if (observation) {
            assert.equal(output.ok, true, JSON.stringify(output))
            maxRangeResponseCharacters = Math.max(maxRangeResponseCharacters, last && 'output' in last ? last.output.length : 0)
            observation.text += output.value.text
            if (output.value.next !== null) return call('observations__read', {
              actionKey: observation.actionKey, sha256: observation.sha256, start: output.value.next, length: 4000,
            })
            result = { ok: true, value: JSON.parse(observation.text) }; observation = undefined
          }
          if (exporting) {
            if (phase++ === 0) return call('visualize__export', { path, name: 'native-fixture' })
            assert.equal(result.ok, true, JSON.stringify(result)); assert.ok(result.artifacts?.length)
            return answer('已生成独立 HTML。')
          }
          switch (phase++) {
            case 0: { const { name, version, hash } = skillIndex(visualizeSkill); return call('skills__load', { name, version, hash }) }
            case 1: assert.equal(result.ok, true); assert.equal(result.value.body, visualizeSkill.body); completeSkillRead = true; consumedSkillSha256 = createHash('sha256').update(result.value.body).digest('hex'); return call('visualize__read_reference', { path: 'references/api.md' })
            case 2: assert.equal(result.ok, true); assert.equal(result.value.text, await readVisualizeReference('references/api.md')); return call('visualize__read_reference', { path: 'references/styles.md' })
            case 3: assert.equal(result.ok, true); assert.equal(result.value.text, await readVisualizeReference('references/styles.md')); return call('visualize__save', { name: 'native-fixture', html })
            case 4: assert.equal(result.ok, true, JSON.stringify(result)); path = result.value.path; assert.equal(await readFile(path, 'utf8'), html); return call('visualize__read', { path })
            default:
              if (!omittedReference) {
                assert.equal(result.ok, true); assert.equal(result.value.html, html); omittedReference = true
                return answer('已保存可视化。') // Activation must force repair before delivery.
              }
              return answer(`::visualize${JSON.stringify({ path, mode: 'wide' })}`)
          }
        } },
    })
    async function turn(messageId: string, text: string) {
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId, version: 1, author: { id: 'test-owner', kind: 'human' }, text, mentions: [agentId] },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
      const signal = AbortSignal.timeout(180000)
      while (!await worker!.runNext()) { signal.throwIfAborted(); await delay(20) }
      let state = await api.readRunState(run)
      while (state?.delivery === 'pending') { signal.throwIfAborted(); await delay(20); state = await api.readRunState(run) }
      assert.equal(state?.run.status, 'succeeded', JSON.stringify(state?.run.goalOutcome)); assert.equal(state.delivery, 'delivered')
      return { run, state }
    }
    const first = await turn('visualize-generate', '用滑杆探索数值变化。')
    assert.equal(omittedReference, true)
    assert.match(first.state.message?.body ?? '', /::visualize/)
    assert.equal((await readAuthorizedVisualizeDocument({ companyId, channelId: conversationId, userId: 'test-owner', path })).html, html)
    await assert.rejects(readAuthorizedVisualizeDocument({ companyId, channelId: 'different-room', userId: 'test-owner', path }))
    await assert.rejects(readAuthorizedVisualizeDocument({ companyId, channelId: conversationId, userId: 'test-owner', path: '/etc/passwd' }))
    assert.match(nativeText(im.messages.at(-1)!.payload), /::visualize/)
    assert.equal(im.messages.at(-1)!.payload.metadata.custom.sourceMessageId, im.messages.at(-1)!.clientMsgNo)
    exporting = true; phase = 0
    const second = await turn('visualize-export', '请导出刚才的可视化为独立HTML。')
    const exported = await api.readArtifact(second.run, 'visualize/native-fixture.html')
    assert.ok(exported); assert.match(Buffer.from(exported.bytes).toString(), /sandbox="allow-scripts"/)
    const ledger = (await pool.query('SELECT count(*)::int AS count FROM llm_calls WHERE run_id=ANY($1::text[]) AND purpose=$2',
      [[first.run.runId, second.run.runId], 'lingxios.agent-turn'])).rows[0]
    assert.equal(ledger.count, calls)
    await mkdir('artifacts/visualize/runtime', { recursive: true })
    await writeFile('artifacts/visualize/runtime/native-fixture.html', exported.bytes)
    await writeFile('artifacts/visualize/runtime/generation.json', JSON.stringify({ skillLoaded: true, completeSkillRead, referenceRead: true, savedAndRead: true,
      skillSha256: createHash('sha256').update(visualizeSkill.body).digest('hex'), consumedSkillSha256, maxRangeResponseCharacters,
      realOutputFile: true, repairedMissingReference: omittedReference, delivered: true, exportedByOriginalRender: true, modelCalls: calls, ledgerCalls: ledger.count, unauthorizedReadRejected: true }, null, 2))
  } finally { await worker?.stop(); await teardownAll(); await im.close() }
})
