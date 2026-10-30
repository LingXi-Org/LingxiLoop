import { Router } from 'express'
import { artifactEditorOrigin } from '../../../../shared/artifact-editor-origin.js'
import { env } from '../../env.js'
import {
  readArtifactCollaboration,
  updateArtifactSharedState,
  assignArtifactWorkspaceWork,
  createSlides,
  deleteArtifact,
  ensureConversationDesign,
  getArtifactSnapshot,
  listArtifacts,
  renameArtifact,
  stopArtifactAssignment,
  stopArtifactWorkspace,
} from './facade.js'
import { safe } from '../../http/async-handler.js'
import { requireArtifact, requireConversationMember } from '../../http/authorization.js'
import { requireAuth, requestedCompanyId } from '../../http/request-context.js'
import { permissionService } from '../access/public.js'
import { pool } from '../../db/pool.js'
import { conversationDesignId } from './repository.js'
import { issueGrant } from './grants.js'
import {
  artifactAssignmentRequestSchema,
  artifactCollaborationQuerySchema,
  artifactCreateRequestSchema,
  artifactStateUpdateSchema,
  artifactSteerRequestSchema,
  artifactUpdateRequestSchema,
} from './contracts.js'

export const artifactsRouter = Router()
const api = artifactsRouter

/* ============== Design: one canvas per conversation ============== */

api.get('/conversations/:id/design', safe(async (req, res) => {
  const membership = await requireConversationMember(req, String(req.params.id))
  const id = await conversationDesignId(pool, membership.companyId, String(req.params.id))
  res.json(id ? await getArtifactSnapshot(membership.companyId, id) : null)
}))

api.post('/conversations/:id/design', safe(async (req, res) => {
  const membership = await requireConversationMember(req, String(req.params.id), 'artifact:write')
  res.status(201).json(await ensureConversationDesign(membership.companyId, String(req.params.id), membership.userId))
}))

/* ============== Slides: decks of a project ============== */

api.get('/projects/:id/slides', safe(async (req, res) => {
  const userId = requireAuth(req), companyId = requestedCompanyId(req), projectId = String(req.params.id)
  await permissionService.assertCan({ actorUserId: userId, companyId, projectId, action: 'artifact:read' })
  res.json(await listArtifacts({ companyId, projectId, kind: 'slides', readerId: userId }))
}))

api.post('/projects/:id/slides', safe(async (req, res) => {
  const userId = requireAuth(req), companyId = requestedCompanyId(req), projectId = String(req.params.id)
  await permissionService.assertCan({ actorUserId: userId, companyId, projectId, action: 'artifact:write' })
  const { title } = artifactCreateRequestSchema.parse(req.body)
  res.status(201).json(await createSlides({ companyId, projectId, conversationId: null, title, actorId: userId, origin: 'user' }))
}))

/* ============== Any artifact ============== */

api.get('/artifacts/:id', safe(async (req, res) => {
  const { companyId } = await requireArtifact(req, String(req.params.id))
  res.json(await getArtifactSnapshot(companyId, String(req.params.id)))
}))

api.patch('/artifacts/:id', safe(async (req, res) => {
  const { companyId } = await requireArtifact(req, String(req.params.id), true)
  res.json(await renameArtifact(companyId, String(req.params.id), artifactUpdateRequestSchema.parse(req.body).title))
}))

api.delete('/artifacts/:id', safe(async (req, res) => {
  const { companyId } = await requireArtifact(req, String(req.params.id), true)
  await deleteArtifact(companyId, String(req.params.id))
  res.json({ ok: true })
}))

/** The editor page's address: a signed grant for this person, artifact and access mode. */
api.post('/artifacts/:id/editor-grant', safe(async (req, res) => {
  const read = await requireArtifact(req, String(req.params.id))
  const write = (await permissionService.can({ actorUserId: read.userId, companyId: read.companyId, action: 'artifact:write',
    resource: { type: 'artifact', id: String(req.params.id) } })).allowed
  const { grant, expiresAt } = issueGrant({ artifactId: String(req.params.id), companyId: read.companyId, userId: read.userId, kind: read.kind, write })
  const origin = read.kind === 'design' ? await artifactEditorOrigin(grant, env.ARTIFACT_EDITOR_BASE) : ''
  res.json({ url: `${origin}/artifact-editor/${read.kind}/${grant}/`, expiresAt, write })
}))

/* ============== Collaboration (shared state, isolated execution) ============== */

api.get('/artifacts/:id/collaboration', safe(async (req,res) => {
  const { userId,companyId } = await requireArtifact(req,String(req.params.id))
  res.json(await readArtifactCollaboration(companyId,userId,String(req.params.id),artifactCollaborationQuerySchema.parse(req.query).afterSeq))
}))

api.post('/artifacts/:id/shared-state', safe(async (req,res) => {
  const { userId,companyId } = await requireArtifact(req,String(req.params.id),true)
  res.json(await updateArtifactSharedState(companyId,userId,String(req.params.id),artifactStateUpdateSchema.parse(req.body)))
}))

api.post('/artifacts/:id/assignments', safe(async (req, res) => {
  const { companyId, userId } = await requireArtifact(req, String(req.params.id), true)
  res.json(await assignArtifactWorkspaceWork({ ...artifactAssignmentRequestSchema.parse(req.body), companyId,
    artifactId: String(req.params.id), actorId: userId, actorKind: 'user' }))
}))

api.post('/artifacts/:id/assignments/:agentId/steer', safe(async (req, res) => {
  const { companyId, userId } = await requireArtifact(req, String(req.params.id), true)
  await assignArtifactWorkspaceWork({ assignment: artifactSteerRequestSchema.parse(req.body).text, companyId,
    artifactId: String(req.params.id), agentId: String(req.params.agentId), actorId: userId, actorKind: 'user' })
  res.json({ ok: true })
}))

api.post('/artifacts/:id/assignments/:agentId/stop', safe(async (req, res) => {
  const { companyId } = await requireArtifact(req, String(req.params.id), true)
  await stopArtifactAssignment({ companyId, artifactId: String(req.params.id), agentId: String(req.params.agentId) })
  res.json({ ok: true })
}))

api.post('/artifacts/:id/stop', safe(async (req, res) => {
  const { companyId } = await requireArtifact(req, String(req.params.id), true)
  await stopArtifactWorkspace({ companyId, artifactId: String(req.params.id) })
  res.json({ ok: true })
}))
