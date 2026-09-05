import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, requestedCompanyId } from '../../http/request-context.js'
import { TrustApplicationError } from './application.js'
import { createTrustSnapshotRequestSchema } from './contracts.js'
import { trustApplication } from './facade.js'

export const trustRouter = Router()

function scope(req: Parameters<typeof requireAuth>[0]) {
  return {
    actorUserId: requireAuth(req),
    companyId: requestedCompanyId(req),
    projectId: String(req.params.projectId ?? ''),
  }
}

function assertLiveMode(value: unknown): void {
  const mode = value === undefined ? 'LIVE' : String(value)
  if (mode === 'LIVE') return
  if (mode === 'DEMO_DATA') throw new HttpError(404, 'no explicitly versioned Trust demo dataset is registered')
  throw new HttpError(400, 'SIGNED_SNAPSHOT data is available only through the snapshot endpoint')
}

function mapError(error: unknown): never {
  if (!(error instanceof TrustApplicationError)) throw error
  throw new HttpError(error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : 409, error.message)
}

trustRouter.get('/trust/projects/:projectId/context', safe(async (req, res) => {
  assertLiveMode(req.query.mode)
  const input = scope(req)
  try { res.json(await trustApplication.context(input.actorUserId, input.companyId, input.projectId)) }
  catch (error) { mapError(error) }
}))
trustRouter.get('/trust/projects/:projectId/kpis', safe(async (req, res) => {
  assertLiveMode(req.query.mode)
  const input = scope(req)
  try { res.json(await trustApplication.kpis(input.actorUserId, input.companyId, input.projectId)) }
  catch (error) { mapError(error) }
}))

trustRouter.get('/trust/projects/:projectId/evidence-chain', safe(async (req, res) => {
  assertLiveMode(req.query.mode)
  const input = scope(req)
  try { res.json(await trustApplication.evidenceChain(input.actorUserId, input.companyId, input.projectId)) }
  catch (error) { mapError(error) }
}))

trustRouter.post('/trust/projects/:projectId/snapshots', safe(async (req, res) => {
  const parsed = createTrustSnapshotRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid request')
  const input = scope(req)
  try {
    res.status(201).json(await trustApplication.createSnapshot(
      input.actorUserId, input.companyId, input.projectId, parsed.data,
    ))
  } catch (error) { mapError(error) }
}))

trustRouter.get('/trust/projects/:projectId/snapshots/:snapshotId', safe(async (req, res) => {
  const input = scope(req)
  try {
    res.json(await trustApplication.readSnapshot(
      input.actorUserId, input.companyId, input.projectId, String(req.params.snapshotId),
    ))
  } catch (error) { mapError(error) }
}))
