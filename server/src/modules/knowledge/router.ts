import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireGroupConversation } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, requireCompany, requireWorkspace } from '../../http/request-context.js'
import { permissionService } from '../access/public.js'
import { KnowledgeApplicationError } from './application.js'
import {
  createProjectRequestSchema,
  createSourceRequestSchema,
  moveConversationRequestSchema,
  presignSourceRequestSchema,
  sourceSelectionRequestSchema,
  updateProjectRequestSchema,
} from './contracts.js'
import { knowledgeApplication, organizationKnowledgeApplication } from './facade.js'

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
  await permissionService.assertCan({ actorUserId: identity.userId, action: 'project:list', companyId: identity.companyId })
  res.json(await knowledgeApplication.projects(identity.companyId, requireAuth(req)))
}))

knowledgeRouter.post('/projects', safe(async (req, res) => {
  const identity = await requireCompany(req)
  await permissionService.assertCan({
    actorUserId: identity.userId,
    action: 'project:create_personal_learning',
    companyId: identity.companyId,
  })
  const input = parse(createProjectRequestSchema.safeParse(req.body ?? {}))
  try {
    res.status(201).json(await knowledgeApplication.createPersonalLearningProject({ ...identity, ...input }))
  } catch (error) {
    mapKnowledgeError(error)
  }
}))

knowledgeRouter.put('/projects/:id', safe(async (req, res) => {
  const projectId = String(req.params.id)
  const workspace = await requireWorkspace(req, projectId, 'project:update')
  const input = parse(updateProjectRequestSchema.safeParse(req.body ?? {}))
  try { res.json(await knowledgeApplication.editProject(workspace, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/open', safe(async (req, res) => {
  const workspace = await requireWorkspace(req, String(req.params.id))
  res.json(await knowledgeApplication.openProject(workspace.companyId, workspace.projectId, workspace.userId))
}))

knowledgeRouter.get('/projects/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:read')
  res.json(await knowledgeApplication.sources(workspace))
}))

knowledgeRouter.get('/projects/:id/sources/:sourceId', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:read')
  try { res.json(await knowledgeApplication.source(workspace, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.get('/organization-knowledge/sources', safe(async (req, res) => {
  const scope = await requireCompany(req)
  try { res.json(await organizationKnowledgeApplication.list(scope.userId, scope.companyId)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.put('/organization-knowledge/sources/:sourceId', safe(async (req, res) => {
  const scope = await requireCompany(req)
  try {
    res.json(await organizationKnowledgeApplication.promote(
      scope.userId, scope.companyId, String(req.params.sourceId),
    ))
  } catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.put('/projects/:id/organization-knowledge/:sourceId', safe(async (req, res) => {
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:manage')
  try {
    res.json(await organizationKnowledgeApplication.attach(
      workspace.userId,
      workspace.companyId,
      workspace.projectId,
      String(req.params.sourceId),
    ))
  } catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:write')
  const input = parse(createSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.createSource(workspace, null, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources/upload/presign', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:write')
  const input = parse(presignSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.presignSource(workspace, null, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources/:sourceId/complete-upload', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:write')
  try { res.json(await knowledgeApplication.completeUpload(workspace, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/projects/:id/sources/:sourceId/retry', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:write')
  await permissionService.assertCan({
    actorUserId: workspace.userId,
    action: 'knowledge:manage',
    companyId: workspace.companyId,
    projectId: workspace.projectId,
    resource: { type: 'knowledge_source', id: String(req.params.sourceId) },
  })
  try { res.json(await knowledgeApplication.retry(workspace, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.delete('/projects/:id/sources/:sourceId', safe(async (req, res) => {
  requireKnowledge()
  const workspace = await requireWorkspace(req, String(req.params.id), 'knowledge:write')
  await permissionService.assertCan({
    actorUserId: workspace.userId,
    action: 'knowledge:manage',
    companyId: workspace.companyId,
    projectId: workspace.projectId,
    resource: { type: 'knowledge_source', id: String(req.params.sourceId) },
  })
  try { res.json(await knowledgeApplication.delete(workspace, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

async function conversationScope(
  req: Parameters<typeof requireGroupConversation>[0],
  conversationId: string,
  action: 'conversation:read' | 'conversation:write' = 'conversation:read',
) {
  const membership = await requireGroupConversation(req, conversationId, action)
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
  const scope = await conversationScope(req, conversationId, 'conversation:write')
  await permissionService.assertCan({
    actorUserId: scope.userId,
    action: 'knowledge:write',
    companyId: scope.companyId,
    projectId: scope.projectId,
  })
  const input = parse(createSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.createSource(scope, conversationId, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/conversations/:id/sources/upload/presign', safe(async (req, res) => {
  requireKnowledge()
  const conversationId = String(req.params.id)
  const scope = await conversationScope(req, conversationId, 'conversation:write')
  await permissionService.assertCan({ actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId })
  const input = parse(presignSourceRequestSchema.safeParse(req.body ?? {}))
  try { res.status(201).json(await knowledgeApplication.presignSource(scope, conversationId, input)) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/conversations/:id/sources/:sourceId/complete-upload', safe(async (req, res) => {
  requireKnowledge()
  const scope = await conversationScope(req, String(req.params.id), 'conversation:write')
  await permissionService.assertCan({ actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId })
  try { res.json(await knowledgeApplication.completeUpload(scope, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.post('/conversations/:id/sources/:sourceId/retry', safe(async (req, res) => {
  requireKnowledge()
  const scope = await conversationScope(req, String(req.params.id), 'conversation:write')
  await permissionService.assertCan({
    actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
    resource: { type: 'knowledge_source', id: String(req.params.sourceId) },
  })
  try { res.json(await knowledgeApplication.retry(scope, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.delete('/conversations/:id/sources/:sourceId', safe(async (req, res) => {
  requireKnowledge()
  const scope = await conversationScope(req, String(req.params.id), 'conversation:write')
  await permissionService.assertCan({
    actorUserId: scope.userId, action: 'knowledge:manage', companyId: scope.companyId, projectId: scope.projectId,
    resource: { type: 'knowledge_source', id: String(req.params.sourceId) },
  })
  try { res.json(await knowledgeApplication.delete(scope, String(req.params.sourceId))) }
  catch (error) { mapKnowledgeError(error) }
}))

knowledgeRouter.put('/conversations/:id/sources', safe(async (req, res) => {
  requireKnowledge()
  const conversationId = String(req.params.id)
  const scope = await conversationScope(req, conversationId, 'conversation:write')
  await permissionService.assertCan({ actorUserId: scope.userId, action: 'knowledge:write', companyId: scope.companyId, projectId: scope.projectId })
  const input = parse(sourceSelectionRequestSchema.safeParse(req.body ?? {}))
  res.json(await knowledgeApplication.selectSources(scope, conversationId, input.excludedSourceIds))
}))

knowledgeRouter.post('/conversations/:id/project', safe(async (req, res) => {
  const identity = await requireCompany(req)
  const sourceContext = await permissionService.assertCan({
    actorUserId: identity.userId,
    action: 'conversation:manage',
    companyId: identity.companyId,
    resource: { type: 'conversation', id: String(req.params.id) },
  })
  const sourceProjectId = sourceContext.project?.id
  if (!sourceProjectId) throw new HttpError(409, 'conversation has no workspace')
  const input = parse(moveConversationRequestSchema.safeParse(req.body ?? {}))
  const target = await requireWorkspace(req, input.projectId, 'knowledge:write')
  try {
    res.json(await knowledgeApplication.moveConversation({
      ...identity, projectId: sourceProjectId, conversationId: String(req.params.id),
      targetProjectId: target.projectId,
    }))
  } catch (error) {
    mapKnowledgeError(error)
  }
}))
