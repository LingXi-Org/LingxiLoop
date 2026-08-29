import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { PRIVILEGED_ROLES, requireCompanyRole, requireGroupConversation } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable, requireAuth, requireCompany, requireWorkspace } from '../../http/request-context.js'
import { KnowledgeApplicationError } from './application.js'
import {
  archiveProjectRequestSchema,
  createProjectRequestSchema,
  createSourceRequestSchema,
  moveConversationRequestSchema,
  presignSourceRequestSchema,
  sourceSelectionRequestSchema,
  updateProjectRequestSchema,
} from './contracts.js'
import { knowledgeApplication } from './facade.js'

export const knowledgeRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapKnowledgeError(error: unknown): never {
  if (!(error instanceof KnowledgeApplicationError)) throw error
  const status = error.code === 'not_found'
    ? 404
    : error.code === 'forbidden'
      ? 403
      : error.code === 'too_large'
        ? 413
        : error.code === 'unavailable'
          ? 503
          : error.code === 'workspace_read_only'
            ? 409
            : 400
  throw new HttpError(status, error.message)
}

function requireKnowledge(): void {
  try { knowledgeApplication.assertAvailable() } catch (error) { mapKnowledgeError(error) }
}

knowledgeRouter.get('/projects', safe(async (req, res) => {
  const identity = await requireCompany(req)
  res.json(await knowledgeApplication.projects(identity.companyId, requireAuth(req)))
}))

knowledgeRouter.post('/projects', safe(async (req, res) => {
  const identity = await requireCompanyRole(req)
  const input = parse(createProjectRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await knowledgeApplication.createProject({ ...identity, ...input }))
}))

knowledgeRouter.put('/projects/:id', safe(async (req, res) => {
  const projectId = String(req.params.id)
  const workspace = await requireWorkspace(req, projectId)
  await assertProjectWritable(workspace.projectId)
  if (!PRIVILEGED_ROLES.has(workspace.role) && workspace.courseRole !== 'teacher') {
    throw new HttpError(403, 'only a course teacher or company admin can edit it')
  }
  const input = parse(updateProjectRequestSchema.safeParse(req.body ?? {}))
  try { res.json(await knowledgeApplication.editProject(workspace.companyId, projectId, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/archive', safe(async (req, res) => {
  const projectId = String(req.params.id)
  const workspace = await requireWorkspace(req, projectId)
  if (workspace.isGeneral) throw new HttpError(400, 'the General workspace cannot be archived')
  if (!PRIVILEGED_ROLES.has(workspace.role) && workspace.courseRole !== 'teacher') {
    throw new HttpError(403, 'only a course teacher or company admin can archive it')
  }
  const input = parse(archiveProjectRequestSchema.safeParse(req.body ?? {}))
  res.json(await knowledgeApplication.archiveProject(workspace.companyId, projectId, input.archive))
}))

knowledgeRouter.post('/projects/:id/open', safe(async (req, res) => {
  const workspace = await requireWorkspace(req, String(req.params.id))
  res.json(await knowledgeApplication.openProject(workspace.companyId, workspace.projectId, workspace.userId))
}))

knowledgeRouter.get('/projects/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id))
  res.json(await knowledgeApplication.sources(workspace))
}))

knowledgeRouter.get('/projects/:id/sources/:sourceId', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id))
  try { res.json(await knowledgeApplication.source(workspace, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const input = parse(createSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.createSource(workspace, null, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources/upload/presign', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const input = parse(presignSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.presignSource(workspace, null, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources/:sourceId/complete-upload', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  try { res.json(await knowledgeApplication.completeUpload(workspace, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources/:sourceId/retry', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const canManage = workspace.projectCreatedBy === workspace.userId || PRIVILEGED_ROLES.has(workspace.role)
  try { res.json(await knowledgeApplication.retry(workspace, String(req.params.sourceId), canManage)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.delete('/projects/:id/sources/:sourceId', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const canManage = workspace.projectCreatedBy === workspace.userId || PRIVILEGED_ROLES.has(workspace.role)
  try { res.json(await knowledgeApplication.delete(workspace, String(req.params.sourceId), canManage)) }
  catch (error) { mapKnowledgeError(error) }
}))

async function conversationScope(req: Parameters<typeof requireGroupConversation>[0], conversationId: string) {
  const membership = await requireGroupConversation(req, conversationId)
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  return { ...membership, projectId: membership.projectId }
}

knowledgeRouter.get('/conversations/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const conversationId = String(req.params.id)
  const scope = await conversationScope(req, conversationId)
  res.json(await knowledgeApplication.conversationSources(scope, conversationId))
}))

knowledgeRouter.get('/conversations/:id/sources/:sourceId', safe(async (req, res) => {
  requireKnowledge()
  const scope = await conversationScope(req, String(req.params.id))
  try { res.json(await knowledgeApplication.source(scope, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/conversations/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const conversationId = String(req.params.id)
  const scope = await conversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  const input = parse(createSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.createSource(scope, conversationId, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/conversations/:id/sources/upload/presign', safe(async (req, res) => {
  requireKnowledge()
  const conversationId = String(req.params.id)
  const scope = await conversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  const input = parse(presignSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.presignSource(scope, conversationId, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/conversations/:id/sources/:sourceId/complete-upload', safe(async (req, res) => {
  requireKnowledge()
  const scope = await conversationScope(req, String(req.params.id))
  await assertProjectWritable(scope.projectId)
  try { res.json(await knowledgeApplication.completeUpload(scope, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/conversations/:id/sources/:sourceId/retry', safe(async (req, res) => {
  requireKnowledge()
  const scope = await conversationScope(req, String(req.params.id))
  await assertProjectWritable(scope.projectId)
  try { res.json(await knowledgeApplication.retry(scope, String(req.params.sourceId), PRIVILEGED_ROLES.has(scope.role))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.delete('/conversations/:id/sources/:sourceId', safe(async (req, res) => {
  requireKnowledge()
  const scope = await conversationScope(req, String(req.params.id))
  await assertProjectWritable(scope.projectId)
  try { res.json(await knowledgeApplication.delete(scope, String(req.params.sourceId), PRIVILEGED_ROLES.has(scope.role))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.put('/conversations/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const conversationId = String(req.params.id)
  const scope = await conversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  const input = parse(sourceSelectionRequestSchema.safeParse(req.body ?? {}))
  res.json(await knowledgeApplication.selectSources(scope, conversationId, input.excludedSourceIds))
}))

knowledgeRouter.post('/conversations/:id/project', safe(async (req, res) => {
  const identity = await requireCompany(req)
  const input = parse(moveConversationRequestSchema.safeParse(req.body ?? {}))
  const target = await requireWorkspace(req, input.projectId)
  try {
    res.json(await knowledgeApplication.moveConversation({
      ...identity, projectId: target.projectId, conversationId: String(req.params.id),
      targetProjectId: target.projectId, targetProjectStatus: target.projectStatus,
    }))
  } catch (error) {
    mapKnowledgeError(error)
  }
}))
