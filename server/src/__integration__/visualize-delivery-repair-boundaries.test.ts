import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { NoEffectError, skillIndex, type ActionContext, type RunVerificationContext } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { withTransaction } from '../db/transaction.js'
import { HttpError } from '../http/errors.js'
import { ForbiddenError } from '../modules/access/public.js'
import { saveVisualizeDocument, visualizeOutputDirectory } from '../im/visualize.js'
import { visualizeTools } from '../agent-runtime/visualize-tools.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { verifyVisualizeAuthoringCandidate, verifyVisualizeDelivery } from '../agent-runtime/visualize-delivery.js'
import { withVisualizeAuthoringFixture } from './_visualize-authoring-fixture.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Written before implementation; docs/evidence/issue-273/FAILURE-MODEL.md.
// Real database authorization/storage boundaries. Direct tool callbacks use the
// explicit existing activation fixture; only the separate Worker test proves
// native activation persistence and actual delivery. No provider/browser claims.
type Owner = { companyId: string; projectId: string; agentId: string; userId: string }
type Fixture = Owner & { channelId: string; runId: string; createdAt: string }
type SavedCandidate = { reference: string; version: number; sourceHash: string }
type Metadata = SavedCandidate & { path: string; html?: string; bytes?: number }
let owner: Owner
const checks: string[] = []
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const reference = (path: string) => `::visualize${JSON.stringify({ path })}`
const actor = (f: Fixture) => ({ companyId: f.companyId, channelId: f.channelId, userId: f.userId })

before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  owner = { ...await seedCompanyWithAgent(), userId: 'repair-boundary-owner' }
  await seedUserMembership(owner.userId, owner.companyId)
  await seedUserMembership('repair-boundary-peer', owner.companyId)
})
after(async () => {
  try {
    await mkdir('artifacts/visualize/issue-273', { recursive: true })
    await writeFile('artifacts/visualize/issue-273/checker-boundaries.json', JSON.stringify({ checks,
      command: 'npm run test:integration -- --file visualize-delivery-repair-boundaries.test.ts',
      scope: 'database metadata, repair-candidate isolation and fresh delivery checks; no model/browser verification',
    }, null, 2))
  } finally { await teardownAll() }
})

async function fixture(identity = owner): Promise<Fixture> {
  const suffix = randomUUID(), channelId = `repair-room-${suffix}`, runId = `repair-run-${suffix}`
  const f = { ...identity, channelId, runId, createdAt: new Date().toISOString() }
  const members = [f.userId, f.agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group','Repair boundary',$4::jsonb)`, [channelId,f.companyId,f.projectId,JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,
    [channelId,f.companyId,JSON.stringify({ channelType: 2,members })])
  await bindRun(f, runId)
  return f
}
async function bindRun(f: Fixture, runId: string) {
  await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
    VALUES($1,$2,$3,$3,$4,$5,2)`, [runId,f.companyId,f.channelId,f.agentId,f.userId])
}
function context(f: Fixture, body = 'The visualization is saved.', database: Queryable = pool, requestVersion = 1): RunVerificationContext {
  const { name,version,hash: skillHash } = skillIndex(visualizeSkill)
  return { work: { id: f.runId,tenantId: f.companyId,agentId: f.agentId,principalId: f.userId,sessionId: f.channelId,
    kind: 'turn',lane: 'interactive',fence: 1,homeEpoch: 1,triggerRef: 'repair-request',createdAt: f.createdAt,
    meta: { conversationId: f.channelId },conversation: { conversationId: f.channelId,policyVersion: 1,
      source: { messageId: 'repair-request',version: 1 },internal: false,
      audience: { visibility: 'conversation',participantIds: [f.userId,f.agentId] } } },
    candidate: { body,requestVersion,artifacts: [] },requestVersion,database,
    signal: AbortSignal.timeout(5000),deadlineAt: new Date(Date.now()+5000).toISOString(),unavailableSkillActivationIds: [],
    skillActivations: [{ id: `activation-${f.runId}`,tenantId: f.companyId,runId: f.runId,requestVersion,
      skill: { name,version,hash: skillHash },checker: 'product:visualize-delivery' }],
  } as RunVerificationContext
}
async function repair(c: RunVerificationContext): Promise<Record<string, unknown> & { savedCandidates: SavedCandidate[] }> {
  const records = await verifyVisualizeAuthoringCandidate(c)
  const record = records.find(item => item.checker === 'product:visualize-authoring')
  assert.ok(record, 'missing reference must request public bounded repair')
  assert.equal(record.status, 'failed')
  assert.equal(record.evidence.deliveryProven, false)
  assert.ok(Array.isArray(record.evidence.savedCandidates))
  assert.equal(typeof record.evidence.candidatesTruncated, 'boolean')
  for (const candidate of record.evidence.savedCandidates) {
    assert.deepEqual(Object.keys(candidate).sort(), ['reference','sourceHash','version'])
    assert.equal(typeof candidate.reference, 'string')
    assert.match(candidate.sourceHash, /^[a-f0-9]{64}$/)
    assert.ok(Number.isSafeInteger(candidate.version) && candidate.version > 0)
  }
  return { ...record.evidence,savedCandidates: record.evidence.savedCandidates as SavedCandidate[] }
}
async function save(f: Fixture, name: string, html = `<div>REPAIR_PRIVATE_HTML_${name}</div>`) {
  return saveVisualizeDocument({ ...actor(f),runId: f.runId,agentId: f.agentId,name,html,requestVersion: 1 })
}
async function insertDocument(f: Fixture, name: string, change: Partial<{
  runId: string; agentId: string; userId: string; requestVersion: number | null; sourceHash: string; version: number;
}> = {}) {
  const path = `${visualizeOutputDirectory(actor(f))}/${name}.html`, html = `<div>REPAIR_PRIVATE_HTML_${name}</div>`
  await pool.query(`INSERT INTO im_visualize_documents(company_id,channel_id,path,run_id,agent_id,created_by,html,source_hash,version,request_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [f.companyId,f.channelId,path,change.runId ?? f.runId,
    change.agentId ?? f.agentId,change.userId ?? f.userId,html,change.sourceHash ?? hash(html),change.version ?? 1,
    change.requestVersion === undefined ? 1 : change.requestVersion])
  return { path,reference: reference(path),version: change.version ?? 1,sourceHash: change.sourceHash ?? hash(html) }
}

test('save/read expose exact transaction metadata and an unchanged retry does not invent a new version', async () => {
  const f = await fixture(), saveTool = visualizeTools.find(tool => tool.action === 'visualize.save')!
  const readTool = visualizeTools.find(tool => tool.action === 'visualize.read')!
  await withTransaction(pool, async database => {
    const originalQuery = pool.query
    pool.query = (() => { throw new Error('metadata must use the supplied transaction') }) as typeof pool.query
    try {
      const c = withVisualizeAuthoringFixture({ ...context(f,'',database),action: { action: 'visualize.save' } } as unknown as ActionContext)
      const versions: number[] = []
      for (const html of ['<div>Version one</div>','<div>Version one</div>','<div>Version two</div>']) {
        const input = saveTool.parse({ name: 'metadata',html })
        await saveTool.authorize(c,input)
        const result = await saveTool.execute(c,input)
        assert.equal(result.ok,true)
        const saved = result.value as Metadata
        const row = (await database.query(`SELECT path,version,source_hash,html FROM im_visualize_documents
          WHERE company_id=$1 AND channel_id=$2 AND path=$3`, [f.companyId,f.channelId,saved.path])).rows[0]
        assert.ok(row)
        assert.deepEqual({ reference: saved.reference,version: saved.version,sourceHash: saved.sourceHash },
          { reference: reference(row.path),version: row.version,sourceHash: row.source_hash })
        assert.equal(saved.sourceHash,hash(html)); assert.equal(saved.bytes,Buffer.byteLength(html))
        const readContext = { ...c,action: { ...c.action,action: 'visualize.read' } }
        const readInput = readTool.parse({ path: saved.path })
        await readTool.authorize(readContext,readInput)
        const resultRead = await readTool.execute(readContext,readInput)
        assert.equal(resultRead.ok,true)
        const read = resultRead.value as Metadata
        assert.deepEqual({ path: read.path,reference: read.reference,version: read.version,sourceHash: read.sourceHash,html: read.html },
          { path: row.path,reference: saved.reference,version: row.version,sourceHash: hash(row.html),html })
        versions.push(saved.version)
      }
      assert.deepEqual(versions,[1,1,2])
    } finally { pool.query = originalQuery }
  })
  checks.push('same-transaction-save-read-metadata-and-noop-version')
})

test('absent candidates remain empty and pending, never an automatically delivered answer', async () => {
  const f = await fixture(), c = context(f)
  const evidence = await repair(c)
  assert.deepEqual(evidence.savedCandidates,[])
  assert.equal(evidence.candidatesTruncated,false)
  assert.equal((await verifyVisualizeDelivery(c))[0].outcome,'pending')
  checks.push('empty-remains-pending')
})

test('repair excludes every foreign scope, unproven request version and corrupted current document', async () => {
  const f = await fixture(), good = await save(f,'only-current')
  const otherRun = `other-run-${randomUUID()}`; await bindRun(f,otherRun)
  const otherAgent = `other-agent-${randomUUID()}`
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
    VALUES($1,$2,'agent','Other agent','tester','O','#abcdef','avail')`, [otherAgent,f.companyId])
  const excluded = [
    await insertDocument(f,'foreign-run',{ runId: otherRun }),
    await insertDocument(f,'foreign-agent',{ agentId: otherAgent }),
    await insertDocument(f,'foreign-principal',{ userId: 'repair-boundary-peer' }),
    await insertDocument(f,'different-request',{ requestVersion: 2 }),
    await insertDocument(f,'unproven-request',{ requestVersion: null }),
    await insertDocument(f,'corrupted-current',{ sourceHash: '0'.repeat(64) }),
    await insertDocument(await fixture(),'foreign-channel'),
  ]
  const foreignOwner = { ...await seedCompanyWithAgent(),userId: `foreign-owner-${randomUUID()}` }
  await seedUserMembership(foreignOwner.userId,foreignOwner.companyId)
  excluded.push(await insertDocument(await fixture(foreignOwner),'foreign-tenant'))
  for (const body of ['Saved without its reference.','::visualize{"path":']) {
    const c = context(f,body), evidence = await repair(c)
    assert.deepEqual(evidence.savedCandidates,[{ reference: reference(good.path),version: 1,sourceHash: hash(good.html) }])
    assert.equal(evidence.candidatesTruncated,false)
    const wire = JSON.stringify(evidence)
    for (const doc of excluded) assert.ok(!wire.includes(doc.path),'foreign/corrupt path must not be disclosed')
    assert.doesNotMatch(wire,/REPAIR_PRIVATE_HTML/)
    assert.equal((await verifyVisualizeDelivery(c))[0].outcome,'pending')
  }
  const revisedRequest = context(f,'The human revised the request.',pool,3)
  const historical = await repair(revisedRequest)
  assert.deepEqual(historical.savedCandidates,[],'versions 1 and 2 are historical, not current-request deliverables')
  assert.equal(historical.candidatesTruncated,false)
  assert.equal((await verifyVisualizeDelivery(revisedRequest))[0].outcome,'pending')
  checks.push('all-scope-request-and-integrity-filters')
})

test('repair uses path ordering and a three-candidate bound, not version as a quality ranking', async () => {
  const f = await fixture()
  const docs = [await insertDocument(f,'z-last',{ version: 99 }),await insertDocument(f,'c-third',{ version: 2 }),
    await insertDocument(f,'a-first',{ version: 3 }),await insertDocument(f,'b-second',{ version: 1 })]
  const sorted = [...docs].sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const expected = sorted.slice(0,3).map(({ reference,version,sourceHash }) => ({ reference,version,sourceHash }))
  const evidence = await repair(context(f))
  assert.deepEqual(evidence.savedCandidates,expected)
  assert.equal(evidence.candidatesTruncated,true)
  assert.doesNotMatch(JSON.stringify(evidence),/REPAIR_PRIVATE_HTML/)
  const hint = String(evidence.hint)
  assert.match(hint,/candidate/i)
  assert.match(hint,/(?:not|does not|neither).*(?:correct|quality|validat)|(?:correct|quality).*(?:not|unverified)/i)
  assert.match(hint,/read.back/i)
  assert.match(hint,/(?:known|actual).*(?:error|problem)|(?:error|problem).*(?:known|actual)/i)
  assert.match(hint,/(?:direct|without|do not|only)/i)
  await pool.query(`DELETE FROM im_visualize_documents WHERE company_id=$1 AND channel_id=$2 AND path=$3`,
    [f.companyId,f.channelId,sorted[3].path])
  const exactlyThree = await repair(context(f))
  assert.deepEqual(exactlyThree.savedCandidates,expected)
  assert.equal(exactlyThree.candidatesTruncated,false)
  checks.push('path-order-three-limit-fourth-truncated-not-content-proof')
})

test('unactivated and mismatched activation requests do not acquire saved-reference suggestions', async () => {
  const f = await fixture(), doc = await save(f,'not-for-this-activation')
  const c = context(f); c.skillActivations = []
  assert.deepEqual(await verifyVisualizeAuthoringCandidate(c),[])
  const changed = context(f)
  changed.skillActivations = changed.skillActivations.map(activation => ({ ...activation,requestVersion: 2 }))
  const records = await verifyVisualizeAuthoringCandidate(changed)
  assert.ok(records.some(record => record.status === 'failed'))
  for (const record of records) assert.deepEqual(record.evidence.savedCandidates ?? [],[])
  assert.ok(!JSON.stringify(records).includes(doc.path))
  checks.push('enrichment-only-for-current-activation-reference-gap')
})

test('binding, frozen audience and actor authorization fail before any candidate-row read', async () => {
  const f = await fixture(), doc = await save(f,'must-stay-private')
  for (const boundary of ['binding','audience','actor'] as const) await withTransaction(pool, async database => {
    if (boundary === 'binding') await database.query('UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2',[f.companyId,f.agentId])
    if (boundary === 'audience') await database.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$3::jsonb)
      WHERE company_id=$1 AND channel_id=$2`,[f.companyId,f.channelId,JSON.stringify([f.userId,f.agentId,'repair-boundary-peer'])])
    if (boundary === 'actor') await database.query('UPDATE conversations SET members=$3::jsonb WHERE company_id=$1 AND id=$2',
      [f.companyId,f.channelId,JSON.stringify([f.agentId])])
    let candidateReads = 0
    const guarded: Queryable = { async query(sql,params) {
      if (/\bim_visualize_documents\b/i.test(sql)) { candidateReads++; throw new Error('candidate-read-before-authorization') }
      return database.query(sql,params ? [...params] : undefined)
    } }
    try {
      const records = await verifyVisualizeAuthoringCandidate(context(f,'Missing reference.',guarded))
      assert.ok(records.every(record => record.status !== 'passed'))
      for (const record of records) assert.deepEqual(record.evidence.savedCandidates ?? [],[])
      assert.ok(!JSON.stringify(records).includes(doc.path))
    } catch (error) {
      assert.ok(error instanceof NoEffectError || error instanceof ForbiddenError || error instanceof HttpError && [403,404].includes(error.status),
        `unexpected authorization failure: ${error instanceof Error ? error.message : String(error)}`)
    }
    assert.equal(candidateReads,0,`${boundary} must be checked before fetching even candidate metadata`)
    if (boundary === 'binding') await database.query('UPDATE participants SET departed_at=NULL WHERE company_id=$1 AND id=$2',[f.companyId,f.agentId])
    if (boundary === 'audience') await database.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$3::jsonb)
      WHERE company_id=$1 AND channel_id=$2`,[f.companyId,f.channelId,JSON.stringify([f.userId,f.agentId])])
    if (boundary === 'actor') await database.query('UPDATE conversations SET members=$3::jsonb WHERE company_id=$1 AND id=$2',
      [f.companyId,f.channelId,JSON.stringify([f.userId,f.agentId])])
  })
  checks.push('authorization-precedes-candidate-reads')
})

test('a suggested reference does not authorize later cross-run/request overwrite or revoked access', async () => {
  const f = await fixture(), doc = await save(f,'mutable')
  const evidence = await repair(context(f))
  assert.deepEqual(evidence.savedCandidates,[{ reference: reference(doc.path),version: 1,sourceHash: hash(doc.html) }])
  const final = context(f,reference(doc.path))
  assert.equal((await verifyVisualizeDelivery(final))[0].outcome,'delivered')
  const otherRun = `replacement-run-${randomUUID()}`; await bindRun(f,otherRun)
  for (const changed of ['run','request','access'] as const) await withTransaction(pool, async database => {
    if (changed === 'run') await database.query('UPDATE im_visualize_documents SET run_id=$2 WHERE path=$1',[doc.path,otherRun])
    if (changed === 'request') await database.query('UPDATE im_visualize_documents SET request_version=2 WHERE path=$1',[doc.path])
    if (changed === 'access') await database.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$3::jsonb)
      WHERE company_id=$1 AND channel_id=$2`,[f.companyId,f.channelId,JSON.stringify([f.agentId])])
    try {
      const decisions = await verifyVisualizeDelivery({ ...final,database })
      assert.equal(decisions[0].outcome,'pending')
      assert.ok(decisions.every(decision => decision.outcome !== 'delivered'))
    } catch (error) {
      assert.ok(error instanceof NoEffectError || error instanceof ForbiddenError || error instanceof HttpError && [403,404].includes(error.status))
    }
    if (changed === 'run') await database.query('UPDATE im_visualize_documents SET run_id=$2 WHERE path=$1',[doc.path,f.runId])
    if (changed === 'request') await database.query('UPDATE im_visualize_documents SET request_version=1 WHERE path=$1',[doc.path])
    if (changed === 'access') await database.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$3::jsonb)
      WHERE company_id=$1 AND channel_id=$2`,[f.companyId,f.channelId,JSON.stringify([f.userId,f.agentId])])
  })
  checks.push('fresh-final-check-rejects-overwrite-and-revocation')
})
