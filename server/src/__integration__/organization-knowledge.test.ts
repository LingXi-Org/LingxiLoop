import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { knowledgeApplication, organizationKnowledgeApplication } from '../modules/knowledge/facade.js'
import { listKnowledgeRetrievalSources } from '../modules/knowledge/retrieval-repository.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const OWNER = 'u-organization-knowledge-owner'
const COMPANY = 'co-organization-knowledge'
const CONTRACT = 'contract-organization-knowledge'
const ORIGIN = 'project-knowledge-origin'
const TARGET = 'project-knowledge-target'
const SOURCE = 'source-organization-knowledge'
const TARGET_CONVERSATION = 'conversation-knowledge-target'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  await pool.query(
    `INSERT INTO users(id,email,display_name)
     VALUES ($1,'organization-knowledge@test.local','Organization Knowledge Owner')`,
    [OWNER],
  )
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,status,plan_id)
     VALUES ($1,'Organization Knowledge','organization-knowledge','EDUCATION','ACTIVE','plan-personal-free')`,
    [COMPANY],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role,status)
     VALUES ($1,$2,'OWNER','ACTIVE')`,
    [COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO education_contracts
       (id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES ($1,$2,'plan-personal-free','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',5)`,
    [CONTRACT, COMPANY],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
     VALUES ('seat-organization-knowledge',$1,$2,$3,'ACTIVE')`,
    [COMPANY, CONTRACT, OWNER],
  )
  await pool.query(
    `INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status)
     VALUES ($1,$2,'human','Organization Knowledge Owner','O','#667085','avail')`,
    [OWNER, COMPANY],
  )
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by) VALUES
       ($1,$3,'INSTITUTIONAL_COURSE','plan-personal-free','Origin Course','ACTIVE',$4),
       ($2,$3,'INSTITUTIONAL_COURSE','plan-personal-free','Target Course','ACTIVE',$4)`,
    [ORIGIN, TARGET, COMPANY, OWNER],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role,status) VALUES
       ($1,$2,$4,'OWNER','ACTIVE'),
       ($1,$3,$4,'OWNER','ACTIVE')`,
    [COMPANY, ORIGIN, TARGET, OWNER],
  )
  await pool.query(
    `INSERT INTO courses(id,company_id,project_id,created_by) VALUES
       ('course-knowledge-origin',$1,$2,$4),
       ('course-knowledge-target',$1,$3,$4)`,
    [COMPANY, ORIGIN, TARGET, OWNER],
  )
  await pool.query(
    `INSERT INTO conversations(id,kind,title,members,leader_id,company_id,project_id)
     VALUES ($1,'group','Target Course Knowledge',$2::jsonb,$3,$4,$5)`,
    [TARGET_CONVERSATION, JSON.stringify([OWNER]), OWNER, COMPANY, TARGET],
  )
  await pool.query(
    `INSERT INTO knowledge_sources
       (id,company_id,project_id,kind,title,external_source_id,status,stage,created_by)
     VALUES ($1,$2,$3,'text','Canonical shared source','external-shared-source','ready','ready',$4)`,
    [SOURCE, COMPANY, ORIGIN, OWNER],
  )
})
after(async () => { await teardownAll() })

test('[integration] Organization Knowledge shares one canonical source with an explicitly attached Course', async () => {
  const promoted = await organizationKnowledgeApplication.promote(OWNER, COMPANY, SOURCE)
  assert.equal(promoted.created, true)
  assert.equal((await organizationKnowledgeApplication.promote(OWNER, COMPANY, SOURCE)).created, false)

  const attached = await organizationKnowledgeApplication.attach(OWNER, COMPANY, TARGET, SOURCE)
  assert.equal(attached.created, true)
  assert.equal((await organizationKnowledgeApplication.attach(OWNER, COMPANY, TARGET, SOURCE)).created, false)

  const visible = await knowledgeApplication.sources({ userId: OWNER, companyId: COMPANY, projectId: TARGET })
  assert.equal(visible.length, 1)
  assert.equal(visible[0]?.id, SOURCE)
  assert.deepEqual(await listKnowledgeRetrievalSources(pool, {
    companyId: COMPANY,
    projectId: TARGET,
    conversationId: TARGET_CONVERSATION,
  }), [{
    id: SOURCE,
    title: 'Canonical shared source',
    externalSourceId: 'external-shared-source',
    originalUrl: null,
    excluded: false,
  }])
  assert.deepEqual((await pool.query(
    `SELECT id,project_id AS "projectId" FROM knowledge_sources WHERE company_id=$1`,
    [COMPANY],
  )).rows, [{ id: SOURCE, projectId: ORIGIN }])
  assert.equal((await pool.query(
    `SELECT 1 FROM domain_events
      WHERE company_id=$1 AND event_type IN ('ORGANIZATION_KNOWLEDGE.PROMOTED','COURSE_KNOWLEDGE.ATTACHED')`,
    [COMPANY],
  )).rowCount, 2)
})
