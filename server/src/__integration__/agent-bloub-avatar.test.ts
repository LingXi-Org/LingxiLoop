import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

test('[integration] agents cannot persist portrait URLs while human profile images remain valid', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()
  await assert.rejects(
    pool.query(`UPDATE participants SET avatar_url=$3 WHERE id=$1 AND company_id=$2`, [
      agentId, companyId, 'https://assets.test.invalid/agent.png',
    ]),
    (error: unknown) => (error as { code?: string; constraint?: string }).code === '23514'
      && (error as { constraint?: string }).constraint === 'participants_agent_bloub_only',
  )

  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,initial,avatar_bg,avatar_url,status)
     VALUES ('human-avatar',$1,'human','Human','H','#ffffff',$2,'avail')`,
    [companyId, 'https://assets.test.invalid/human.png'],
  )
  const { rows } = await pool.query<{ avatar_url: string | null }>(
    `SELECT avatar_url FROM participants WHERE id='human-avatar' AND company_id=$1`,
    [companyId],
  )
  assert.equal(rows[0]?.avatar_url, 'https://assets.test.invalid/human.png')
})
