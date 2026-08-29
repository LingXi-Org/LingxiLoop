import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { DocumentMentionApplication } from '../modules/documents/mention-application.js'
import {
  claimDocumentMentionDelivery,
  completeDocumentMentionDelivery,
} from '../modules/documents/mention-repository.js'
import { ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

const COMPANY = 'company-document-mention'
const PROJECT = 'project-document-mention'
const DOCUMENT = 'document-mention'
const MENTIONER = 'human-mentioner'
const AGENT = 'agent-mentioned'

before(ensureSchemaOnce)
beforeEach(async () => {
  await resetAllTables()
  await pool.query(
    `INSERT INTO companies (id,name,slug) VALUES ($1,'Document mention',$1)`,
    [COMPANY],
  )
  await seedUserMembership(MENTIONER, COMPANY, { displayName: 'Lee' })
  await pool.query(
    `INSERT INTO projects (id,company_id,name,description,color,created_by,is_general)
     VALUES ($1,$2,'General','','#64748b',$3,TRUE)`,
    [PROJECT, COMPANY, MENTIONER],
  )
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,initial,avatar_bg,status)
     VALUES ($1,$2,'agent','Sage','S','#64748b','avail')`,
    [AGENT, COMPANY],
  )
  await pool.query(
    `INSERT INTO documents (id,company_id,project_id,title,created_by)
     VALUES ($1,$2,$3,'Launch notes',$4)`,
    [DOCUMENT, COMPANY, PROJECT, MENTIONER],
  )
})
after(() => teardownAll())

test('[integration] concurrent document mentions converge on one durable delivery', async () => {
  const application = new DocumentMentionApplication({
    transaction: (work) => withTransaction(pool, work),
    publish: async () => undefined,
    wakeAgent: async () => undefined,
    metric: () => undefined,
  })
  const input = {
    documentId: DOCUMENT,
    companyId: COMPANY,
    mentionerId: MENTIONER,
    requestedIds: [AGENT],
  }

  const crossTenant = await application.notify({ ...input, companyId: 'another-company' })
  assert.deepEqual(crossTenant, { deliveryId: null, mentionedIds: [] })

  const results = await Promise.all([application.notify(input), application.notify(input)])
  assert.equal(results.filter((result) => result.deliveryId).length, 1)
  const { rows: mentionCount } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM document_mentions WHERE company_id=$1 AND document_id=$2`,
    [COMPANY, DOCUMENT],
  )
  const { rows: deliveryCount } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM document_mention_deliveries WHERE company_id=$1 AND document_id=$2`,
    [COMPANY, DOCUMENT],
  )
  const { rows: logCount } = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM agent_log WHERE company_id=$1 AND agent_id=$2 AND kind='doc_mention'`,
    [COMPANY, AGENT],
  )
  assert.equal(mentionCount[0]?.count, 1)
  assert.equal(deliveryCount[0]?.count, 1)
  assert.equal(logCount[0]?.count, 1)

  const delivery = await withTransaction(pool, (db) => claimDocumentMentionDelivery(db, 'worker-1', 60_000))
  assert.equal(delivery?.recipients[0]?.id, AGENT)
  assert.equal(await withTransaction(pool, (db) => completeDocumentMentionDelivery(db, delivery!)), true)
  const { rows: completed } = await pool.query<{ status: string; completed_at: Date | null }>(
    `SELECT status,completed_at FROM document_mention_deliveries WHERE id=$1`,
    [delivery!.id],
  )
  assert.equal(completed[0]?.status, 'completed')
  assert.ok(completed[0]?.completed_at)
})
