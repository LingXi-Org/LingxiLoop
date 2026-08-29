import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireCompanyRole } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, requireCompany, requireCompanyArtifactContext } from '../../http/request-context.js'
import { AgentApplicationError } from './application.js'
import { autonomyRequestSchema, createAgentRequestSchema, preferencesRequestSchema, updateAgentRequestSchema } from './contracts.js'
import { agentApplication } from './facade.js'

export const agentsRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapError(error: unknown): never {
  if (!(error instanceof AgentApplicationError)) throw error
  const status = error.code === 'not_found' ? 404 : error.code === 'conflict' ? 409 : 400
  const http = new HttpError(status, error.message) as HttpError & { detail?: unknown }
  http.detail = error.detail
  throw http
}

async function respond<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() } catch (error) { mapError(error) }
}

agentsRouter.get('/participants', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  res.json(await agentApplication.participants(scope))
}))

agentsRouter.post('/agents', safe(async (req, res) => {
  const scope = await requireCompanyRole(req)
  const input = parse(createAgentRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => agentApplication.create(scope, input)))
}))

agentsRouter.put('/agents/:id', safe(async (req, res) => {
  const scope = await requireCompanyRole(req)
  const input = parse(updateAgentRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => agentApplication.update(scope, String(req.params.id), input)))
}))

agentsRouter.delete('/agents/:id', safe(async (req, res) => {
  const scope = await requireCompanyRole(req)
  try { res.json(await agentApplication.offboard(scope, String(req.params.id))) }
  catch (error) {
    if (error instanceof AgentApplicationError && error.detail) {
      res.status(409).json({ error: error.message, conversations: error.detail }); return
    }
    mapError(error)
  }
}))

agentsRouter.post('/agents/:id/rehire', safe(async (req, res) => {
  const scope = await requireCompanyRole(req)
  res.json(await respond(() => agentApplication.rehire(scope, String(req.params.id))))
}))

agentsRouter.get('/me/preferences', safe(async (req, res) => {
  res.json(await agentApplication.preferences(requireAuth(req)))
}))

agentsRouter.put('/me/preferences', safe(async (req, res) => {
  const input = parse(preferencesRequestSchema.safeParse(req.body ?? {}))
  res.json(await agentApplication.savePreferences(requireAuth(req), input))
}))

agentsRouter.get('/agents/:id/autonomy', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => agentApplication.autonomy(scope, String(req.params.id))))
}))

agentsRouter.put('/agents/:id/autonomy', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(autonomyRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => agentApplication.saveAutonomy(scope, String(req.params.id), input.threshold)))
}))

agentsRouter.get('/agents/autonomy', safe(async (req, res) => {
  res.json(await agentApplication.allAutonomy(await requireCompany(req)))
}))
