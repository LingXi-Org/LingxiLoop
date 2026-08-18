import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { pool } from '../db/pool.js'
import {
  buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll,
} from './_helpers.js'
import { runShippingMaintenance } from '../shipping-maintenance.js'

const USER_ID = 'u-ship-verifier'
const COMPANY_ID = 'c-shipping-loop'
const BUILDER_ID = 'a-builder'
let server: Server
let baseUrl = ''

before(async () => {
  await ensureSchemaOnce()
  const app = await buildApiTestApp(USER_ID)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const address = server.address()
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
  await pool.query(
    `INSERT INTO companies (id,name,slug,owner_user_id) VALUES ($1,'Shipping Co','shipping-co',$2)`,
    [COMPANY_ID, USER_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID, { displayName: 'Independent Verifier' })
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status)
     VALUES ($1,$2,'agent','Builder','engineer','B','#123456','avail')`,
    [BUILDER_ID, COMPANY_ID],
  )
})

after(async () => { await teardownAll(server) })

async function call(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-company-id': COMPANY_ID },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await response.json() as any
  return { response, json }
}

test('[integration] shipping contract enforces independent evidence, staged production, and readback', async () => {
  const created = await call('/shipping/features', 'POST', {
    title: 'Reliable export',
    problem: 'Exports can finish without a durable artifact.',
    desiredOutcome: 'Every completed export is downloadable and traceable.',
    contractSummary: 'One export path; no format redesign.',
    builderIds: [BUILDER_ID],
    riskLevel: 'high',
  })
  assert.equal(created.response.status, 201)
  const featureId = created.json.id as string
  assert.equal(created.json.verifications.length, 3)

  const invariant = await call(`/shipping/features/${featureId}/invariants`, 'POST', {
    title: 'Completion always references an existing artifact', kind: 'data', required: true,
  })
  assert.equal(invariant.response.status, 201)
  const invariantId = invariant.json.invariants[0].id as string
  const square = await call(`/shipping/features/${featureId}/verifications`, 'POST', {
    title: 'Reconcile completed exports to storage', method: 'data_reconciliation',
    invariantId, ownerId: USER_ID, builderIds: [BUILDER_ID], required: true,
  })
  assert.equal(square.response.status, 201)

  for (const verification of square.json.verifications as Array<{ id: string; ownerId: string | null }>) {
    if (verification.ownerId) continue
    const assigned = await call(`/shipping/features/${featureId}/verifications/${verification.id}`, 'PATCH', { ownerId: USER_ID })
    assert.equal(assigned.response.status, 200)
  }

  assert.equal((await call(`/shipping/features/${featureId}/transition`, 'POST', { status: 'contract' })).response.status, 200)
  assert.equal((await call(`/shipping/features/${featureId}/transition`, 'POST', { status: 'building' })).response.status, 200)
  assert.equal((await call(`/shipping/features/${featureId}/transition`, 'POST', { status: 'verifying' })).response.status, 200)

  const detail = (await call(`/shipping/features/${featureId}`)).json
  for (const verification of detail.verifications as Array<{ id: string }>) {
    const passed = await call(`/shipping/features/${featureId}/verifications/${verification.id}`, 'PATCH', {
      status: 'passed', evidence: [{ note: `independent proof for ${verification.id}` }],
    })
    assert.equal(passed.response.status, 200)
  }
  assert.equal((await call(`/shipping/features/${featureId}/transition`, 'POST', { status: 'ready' })).response.status, 200)

  const prematureProduction = await call(`/shipping/features/${featureId}/releases`, 'POST', {
    environment: 'production', version: 'v1', releaseNotes: 'Reliable exports',
    rollbackPlan: 'Roll deployment back to prior digest', baseline: [{ metric: 'export_success_rate=99%' }],
  })
  assert.equal(prematureProduction.response.status, 201)
  const productionId = prematureProduction.json.releases[0].id as string
  const blockedApproval = await call(`/shipping/features/${featureId}/releases/${productionId}/action`, 'POST', { action: 'approve' })
  assert.equal(blockedApproval.response.status, 409)
  assert.match(blockedApproval.json.error, /staging|canary/i)

  const staging = await call(`/shipping/features/${featureId}/releases`, 'POST', { environment: 'staging', version: 'v1-rc1' })
  const stagingId = (staging.json.releases as Array<{ id: string; environment: string }>).find((release) => release.environment === 'staging')?.id
  assert.ok(stagingId)
  assert.equal((await call(`/shipping/features/${featureId}/releases/${stagingId}/action`, 'POST', { action: 'start' })).response.status, 200)
  const undocumentedFailure = await call(`/shipping/features/${featureId}/releases/${stagingId}/action`, 'POST', { action: 'fail' })
  assert.equal(undocumentedFailure.response.status, 409)
  assert.match(undocumentedFailure.json.error, /diagnostic evidence/i)
  assert.equal((await call(`/shipping/features/${featureId}/releases/${stagingId}/action`, 'POST', { action: 'succeed', evidence: [{ note: 'staging user path passed' }] })).response.status, 200)

  assert.equal((await call(`/shipping/features/${featureId}/releases/${productionId}/action`, 'POST', { action: 'approve' })).response.status, 200)
  assert.equal((await call(`/shipping/features/${featureId}/releases/${productionId}/action`, 'POST', { action: 'start' })).response.status, 200)
  const shipped = await call(`/shipping/features/${featureId}/releases/${productionId}/action`, 'POST', { action: 'succeed', evidence: [{ note: 'authenticated production smoke passed' }] })
  assert.equal(shipped.response.status, 200)
  assert.equal(shipped.json.status, 'watching')
  assert.ok(shipped.json.releases.find((release: any) => release.id === productionId).readbackDueAt)

  assert.equal((await call(`/shipping/features/${featureId}/releases/${productionId}/action`, 'POST', { action: 'readback_pass', evidence: [{ note: '24h export success rate remained above baseline' }] })).response.status, 200)
  const learned = await call(`/shipping/features/${featureId}/transition`, 'POST', { status: 'learned' })
  assert.equal(learned.response.status, 200)
  assert.equal(learned.json.status, 'learned')
})

test('[integration] builders cannot pass their own evidence squares', async () => {
  const created = await call('/shipping/features', 'POST', { title: 'Self check', builderIds: [USER_ID] })
  const featureId = created.json.id as string
  const squareId = created.json.verifications[0].id as string
  const result = await call(`/shipping/features/${featureId}/verifications/${squareId}`, 'PATCH', {
    status: 'passed', evidence: [{ note: 'I checked my own work' }],
  })
  assert.equal(result.response.status, 409)
  assert.match(result.json.error, /cannot verify their own work/i)
})

test('[integration] failed production readback reopens building and creates critical friction', async () => {
  const created = await call('/shipping/features', 'POST', { title: 'Production contract' })
  const featureId = created.json.id as string
  const releaseId = 'sr-readback-failure'
  await pool.query(`UPDATE shipping_features SET status='watching' WHERE id=$1`, [featureId])
  await pool.query(
    `INSERT INTO shipping_releases
      (id,feature_id,environment,status,readback_status,completed_at,readback_due_at)
     VALUES ($1,$2,'production','succeeded','pending',NOW(),NOW()+INTERVAL '24 hours')`,
    [releaseId, featureId],
  )

  const failed = await call(`/shipping/features/${featureId}/releases/${releaseId}/action`, 'POST', {
    action: 'readback_fail', evidence: [{ note: 'Error rate exceeded the release baseline' }],
  })
  assert.equal(failed.response.status, 200)
  assert.equal(failed.json.status, 'building')
  assert.equal(failed.json.releases.find((release: any) => release.id === releaseId).readbackStatus, 'failed')
  const friction = failed.json.frictions.find((item: any) => item.source === 'production-readback')
  assert.ok(friction)
  assert.equal(friction.severity, 'critical')
})

test('[integration] maintenance promotes overdue readbacks exactly once', async () => {
  const created = await call('/shipping/features', 'POST', { title: 'Readback clock' })
  const featureId = created.json.id as string
  await pool.query(`UPDATE shipping_features SET status='watching' WHERE id=$1`, [featureId])
  await pool.query(
    `INSERT INTO shipping_releases
      (id,feature_id,environment,status,readback_status,completed_at,readback_due_at)
     VALUES ('sr-overdue',$1,'production','succeeded','pending',NOW()-INTERVAL '25 hours',NOW()-INTERVAL '1 hour')`,
    [featureId],
  )

  assert.deepEqual(await runShippingMaintenance(), { overdue: 1, frictionSignals: 0 })
  assert.deepEqual(await runShippingMaintenance(), { overdue: 0, frictionSignals: 0 })

  const detail = await call(`/shipping/features/${featureId}`)
  assert.equal(detail.response.status, 200)
  assert.equal(detail.json.releases[0].readbackStatus, 'overdue')
  assert.equal(detail.json.frictions.filter((item: any) => item.source === 'readback').length, 1)
})
