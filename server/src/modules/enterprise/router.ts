import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, requestedCompanyId } from '../../http/request-context.js'
import { EnterpriseApplicationError } from './application.js'
import {
  createOrganizationUnitRequestSchema,
  governancePolicyKindSchema,
  putGovernancePolicyRequestSchema,
} from './contracts.js'
import { enterpriseApplication } from './facade.js'

export const enterpriseRouter = Router()

function mapError(error: unknown): never {
  if (!(error instanceof EnterpriseApplicationError)) throw error
  throw new HttpError(error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : 409, error.message)
}

enterpriseRouter.get('/enterprise/organization-units', safe(async (req, res) => {
  try { res.json(await enterpriseApplication.listUnits(requireAuth(req), requestedCompanyId(req))) }
  catch (error) { mapError(error) }
}))

enterpriseRouter.post('/enterprise/organization-units', safe(async (req, res) => {
  const parsed = createOrganizationUnitRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid Organization Unit')
  try {
    const result = await enterpriseApplication.createUnit(requireAuth(req), requestedCompanyId(req), parsed.data)
    res.status(result.created ? 201 : 200).json(result)
  } catch (error) { mapError(error) }
}))

enterpriseRouter.get('/enterprise/governance-policies', safe(async (req, res) => {
  try { res.json(await enterpriseApplication.listPolicies(requireAuth(req), requestedCompanyId(req))) }
  catch (error) { mapError(error) }
}))

enterpriseRouter.put('/enterprise/governance-policies/:kind', safe(async (req, res) => {
  const kind = governancePolicyKindSchema.safeParse(req.params.kind)
  const body = putGovernancePolicyRequestSchema.safeParse(req.body ?? {})
  if (!kind.success || !body.success) throw new HttpError(400, 'invalid governance Policy request')
  try {
    res.json(await enterpriseApplication.putPolicy(
      requireAuth(req), requestedCompanyId(req), kind.data, body.data,
    ))
  } catch (error) { mapError(error) }
}))
