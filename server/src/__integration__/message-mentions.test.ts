import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { createNativeMessage, nativeMessageSchema, nativeText } from '../im/message-types.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { parseMentions } from '../mentions.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await recording?.close(); await teardownAll() })

test('contiguous public answer survives admission, receipt, retry and authorized history without corrupting mentions', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query("UPDATE participants SET name='明理' WHERE company_id=$1 AND id=$2", [companyId, agentId])
  const channelId = 'synthetic-segment-mentions', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  const texts = ['🙂第一段 @明理核对。\n\n', '| 成员 | 任务 |\n| @明理 | 验证 |\n', '第三段@明理检查 [依据](#cite-S1)。']
  const original = texts.join(''), expected = original.replaceAll('@明理', `@${agentId}`)
  let offset = 0
  const content = texts.map((text, index) => {
    const part = { type: 'text' as const, text, providerMetadata: { lingxiloop: { answerSegment: {
      version: 3, messageId: 'synthetic-public-answer', segmentId: `segment-${index}`, partId: `part-${index}`, start: offset, end: offset + text.length,
    } } } }
    offset += text.length
    return part
  })
  const payload = createNativeMessage({ id: 'synthetic-segments', role: 'assistant', content: [
    { type: 'text', text: '公开进度 @明理', providerMetadata: { lingxiloop: { activity: {
      version: 1, id: 'synthetic-progress', label: '公开进度', kind: 'commentary',
    } } } }, ...content, { type: 'data', name: 'citation-claims', data: { claims: [{
      start: original.indexOf('['), end: original.indexOf(')') + 1, text: '依据', markers: ['S1'],
    }] } },
  ] })
  assert.equal(nativeText(payload), original, 'synthetic public stream/source projection is still correct before admission')
  const input = { companyId, userId: agentId, channelId, clientNonce: payload.id, payload }
  const accepted = await imMessagesApplication.acceptAgentMessage(input)
  assert.equal(accepted.kind, 'accepted')
  if (accepted.kind !== 'accepted') throw new Error('synthetic message rejected')
  assert.equal(nativeText(nativeMessageSchema.parse(accepted.echo.payload)), expected)
  assert.equal(nativeText(recording.messages[0].payload), expected, 'WuKong HTTP send receives the same canonical text')
  const retry = await imMessagesApplication.acceptAgentMessage(input)
  assert.equal(retry.kind, 'accepted')
  if (retry.kind !== 'accepted') throw new Error('synthetic retry rejected')
  assert.equal(retry.duplicate, true)
  assert.deepEqual(retry.echo, accepted.echo, 'same nonce reads its recorded receipt')
  assert.equal(recording.messages.length, 1, 'admission retry never sends twice')
  await pool.query("UPDATE participants SET name='新的明理' WHERE company_id=$1 AND id=$2", [companyId, agentId])
  const history = await imMessagesApplication.history({ companyId, userId: 'test-owner', channelId, limit: 20, beforeSequence: 0 })
  assert.equal(history?.length, 1)
  const saved = history![0].payload
  const receipt = nativeMessageSchema.parse(accepted.echo.payload)
  assert.equal(saved.id, receipt.id)
  assert.equal(saved.role, receipt.role)
  assert.equal(saved.createdAt, receipt.createdAt)
  assert.deepEqual(saved.content, receipt.content, 'authorized history preserves receipt content/source coordinates after rename')
  assert.deepEqual(parseMentions(nativeText(saved), [{ id: agentId, name: '新的明理' }]).mentionedIds, [agentId])
  const data = saved.content.find(part => part.type === 'data' && part.name === 'citation-claims')
  assert.ok(data?.type === 'data')
  const claim = (data.data as { claims: { start: number; end: number }[] }).claims[0]
  assert.equal(nativeText(saved).slice(claim.start, claim.end), '[依据](#cite-S1)')
})
