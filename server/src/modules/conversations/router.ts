import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireConversationMember } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import {
  assertConversationWritable,
  assertProjectWritable,
  requireCompany,
  requireCompanyArtifactContext,
  requireWorkspace,
} from '../../http/request-context.js'
import { ConversationApplicationError } from './application.js'
import {
  addMemberRequestSchema,
  createGroupRequestSchema,
  leaderRequestSchema,
  muteRequestSchema,
  openDirectRequestSchema,
  pinRequestSchema,
  searchQuerySchema,
  titleRequestSchema,
  topicRequestSchema,
  typingRequestSchema,
} from './contracts.js'
import { conversationsApplication } from './facade.js'

export const conversationsRouter = Router()

async function requireConversationScope(
  req: Parameters<typeof requireConversationMember>[0],
  conversationId: string,
) {
  const scope = await requireConversationMember(req, conversationId)
  if (!scope.projectId) throw new HttpError(409, 'conversation workspace is missing')
  return { ...scope, projectId: scope.projectId }
}

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapApplicationError(error: unknown): never {
  if (!(error instanceof ConversationApplicationError)) throw error
  const status = error.code === 'not_found'
    ? 404
    : error.code === 'not_member' || error.code === 'managed_pulse' || error.code === 'teacher_room_managed'
      ? 403
      : error.code === 'workspace_read_only' || error.code === 'idempotency_conflict' || error.code === 'binding_missing'
        ? 409
        : 400
  throw new HttpError(status, error.message)
}

conversationsRouter.post('/conversations', safe(async (req, res) => {
  const identity = await requireCompany(req)
  const input = parse(createGroupRequestSchema.safeParse(req.body ?? {}))
  const workspace = await requireWorkspace(req, input.workspaceId)
  try {
    const result = await conversationsApplication.createGroup(identity, workspace, input)
    res.status(result.created ? 201 : 200).json(result)
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/direct', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const input = parse(openDirectRequestSchema.safeParse(req.body ?? {}))
  const workspace = await requireWorkspace(req, scope.projectId)
  try {
    const result = await conversationsApplication.openDirect(scope, workspace, input.otherId)
    res.status(result.created ? 201 : 200).json(result)
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/leader', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  const input = parse(leaderRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await conversationsApplication.setLeader(scope, conversationId, input.leaderId))
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/topic', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  const input = parse(topicRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await conversationsApplication.setTopic(scope, conversationId, input.topic))
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/title', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  const input = parse(titleRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await conversationsApplication.setTitle(scope, conversationId, input.title))
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/pin', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationScope(req, conversationId)
  await assertConversationWritable(scope.companyId, conversationId)
  const input = parse(pinRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await conversationsApplication.setPinned(scope, conversationId, input.pinned))
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/mute', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationScope(req, conversationId)
  const input = parse(muteRequestSchema.safeParse(req.body ?? {}))
  const until = input.until ? new Date(input.until) : null
  if (input.mute && until && until.getTime() <= Date.now()) {
    throw new HttpError(400, 'until must be in the future')
  }
  try {
    res.json(await conversationsApplication.setMuted(scope, conversationId, input.mute, until))
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/members', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  const input = parse(addMemberRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await conversationsApplication.addMember(scope, conversationId, input.id))
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/leave', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationScope(req, conversationId)
  await assertProjectWritable(scope.projectId)
  try {
    res.json(await conversationsApplication.leave(scope, conversationId))
  } catch (error) {
    mapApplicationError(error)
  }
}))

conversationsRouter.post('/conversations/:id/typing', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationMember(req, conversationId)
  const input = parse(typingRequestSchema.safeParse(req.body ?? {}))
  await conversationsApplication.typing(scope, conversationId, input.done)
  res.json({ ok: true })
}))

conversationsRouter.get('/search', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  const input = parse(searchQuerySchema.safeParse(req.query))
  res.json(await conversationsApplication.search(scope, input.q))
}))
