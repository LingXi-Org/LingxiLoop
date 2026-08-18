import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { runCli } from '../agents/cli.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

test('[integration] mute suppresses group delivery but preserves exact mentions and quote replies', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()
  const peerId = `a-${randomUUID().slice(0, 8)}`
  const humanId = `u-${randomUUID().slice(0, 8)}`
  const conversationId = `g-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status)
     VALUES ($1,$2,'agent','Peer','engineer','P','#123456','avail'),
            ($3,$2,'human','Human','owner','H','#654321','avail')`,
    [peerId, companyId, humanId],
  )
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,tag,company_id)
     VALUES ($1,'group','Muted room',$2::jsonb,'group',$3)`,
    [conversationId, JSON.stringify([agentId, peerId, humanId]), companyId],
  )
  const quotedMessageId = `m-${randomUUID()}`
  await pool.query(
    `INSERT INTO messages (id,conversation_id,author_id,kind,body,sequence,company_id)
     VALUES ($1,$2,$3,'text','my earlier message',1,$4)`,
    [quotedMessageId, conversationId, agentId, companyId],
  )

  const muted = await runCli(['--as', agentId, 'mute', conversationId, '--for', '1h'])
  assert.equal(muted.ok, true, muted.text)
  assert.match(muted.text, /direct @.* mention|mention/i)

  await pool.query(
    `INSERT INTO messages (id,conversation_id,author_id,kind,body,sequence,company_id,quoted_message_id)
     VALUES ($1,$4,$5,'text','ordinary chatter',2,$6,NULL),
            ($2,$4,$5,'text',$7,3,$6,NULL),
            ($3,$4,$5,'text','answering your exact point',4,$6,$8)`,
    [`m-${randomUUID()}`, `m-${randomUUID()}`, `m-${randomUUID()}`, conversationId, peerId,
      companyId, `please inspect this @${agentId}`, quotedMessageId],
  )

  const inbox = await runCli(['--as', agentId, 'inbox'])
  assert.equal(inbox.ok, true, inbox.text)
  assert.doesNotMatch(inbox.text, /ordinary chatter/)
  assert.match(inbox.text, new RegExp(`please inspect this @${agentId}`))
  assert.match(inbox.text, /answering your exact point/)

  const followed = await runCli(['--as', agentId, 'follow', conversationId])
  assert.equal(followed.ok, true, followed.text)
  await pool.query(
    `INSERT INTO messages (id,conversation_id,author_id,kind,body,sequence,company_id)
     VALUES ($1,$2,$3,'text','ordinary delivery resumed',5,$4)`,
    [`m-${randomUUID()}`, conversationId, peerId, companyId],
  )
  const resumed = await runCli(['--as', agentId, 'inbox'])
  assert.match(resumed.text, /ordinary delivery resumed/)
})

test('[integration] direct conversations cannot be muted', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()
  const humanId = `u-${randomUUID().slice(0, 8)}`
  const conversationId = `d-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status)
     VALUES ($1,$2,'human','Human','owner','H','#654321','avail')`,
    [humanId, companyId],
  )
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,tag,company_id)
     VALUES ($1,'direct','Direct',$2::jsonb,'human',$3)`,
    [conversationId, JSON.stringify([agentId, humanId]), companyId],
  )
  const result = await runCli(['--as', agentId, 'mute', conversationId])
  assert.equal(result.ok, false)
  assert.match(result.text, /direct conversations always deliver/i)
})
