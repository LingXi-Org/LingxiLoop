import { productConversationId } from '../../agent-runtime/identity.js'
import { NoEffectError, type ActionContext, type ToolDefinition, type PresentationDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeContext, nativeTool, compareResource, authorizeAudienceRead, audienceHumanIds } from '../../agents/tools.js'
import { queueNativeEvents, type NativeEvent } from '../../agents/native-events.js'
import { env } from '../../env.js'
import { storage } from '../../storage.js'
import { createPermissionService } from '../access/public.js'
import { PresentationsApplication, createPresentationAgentFacade } from './application.js'
import { agentPresentationSchemas as schemas } from './contracts.js'
import { resolvePresentationCreationScope } from './repository.js'

function application(context: ActionContext) {
  const events: NativeEvent[] = [], db = context.database as Queryable
  const app = new PresentationsApplication({ db, transaction: operation => operation(db), storage,
    enabled: () => env.PRESENTATION_HTML_ENABLED,
    async sendArtifactCard(input) { events.push({ type: 'im.system', companyId: input.companyId,
      actorId: input.agentId, channelId: input.channelId, clientNonce: input.clientMsgNo,
      payload: { version: 1, kind: 'artifact', clientMsgNo: input.clientMsgNo, body: input.title,
        refs: { presentationId: input.presentationId, agentId: input.agentId },
        data: { artifactId: input.presentationId, artifactKind: 'lecture_deck_html', title: input.title } } }) },
  })
  return { app, api: createPresentationAgentFacade(app), events }
}

async function authorize(context: ActionContext, presentationId?: string, write = false) {
  const { work } = context
  await authorizeAudienceRead(context,{ action: 'knowledge:read',resource: { type: 'conversation',id: productConversationId(work) } })
  await createPermissionService(context.database as Queryable, { lockDependencies: true }).assertCan({
    actorUserId: work.principalId!, companyId: work.tenantId, action: write ? 'knowledge:write' : 'knowledge:read',
    resource: { type: 'conversation', id: productConversationId(work) } })
  if (presentationId) {
    // The product API also checks the presentation's project and private owner.
    for (const userId of await audienceHumanIds(context)) await application(context).app.get(work.tenantId,userId,presentationId)
    if (write) await context.database.query('SELECT id FROM presentations WHERE company_id=$1 AND id=$2 FOR UPDATE', [work.tenantId,presentationId])
  }
}

const verify: ToolDefinition['verify'] = async (context, _input, value) => {
  const expected = value as { id: string; status: string }
  await authorize(context, expected.id)
  const current = await application(context).api.getPresentationForAgent(nativeContext(context), expected.id)
  const result = compareResource(`presentation:${expected.id}`, { id: expected.id }, current)
  if (result.status === 'failed') return result
  const method = context.action.action.split('.')[1]
  const complete = method === 'cancel' ? current.status === 'cancelled'
    : method === 'revise_outline' ? current.status === 'awaitingOutlineApproval' : current.status === 'ready'
  return { status: complete ? 'passed' : ['failed','cancelled','needsAttention'].includes(current.status) ? 'failed' : 'inconclusive',
    evidence: { ...result.evidence, phase: current.status, generationComplete: complete } }
}

export const presentationCard: PresentationDefinition = {
  type: 'presentation-artifact', version: '1', description: 'An authorized presentation and its current source version.', actions: ['presentations.get'],
  async authorize(context, reference) {
    await authorize(context,reference)
  },
  async resolve(context, reference) {
    const current = await application(context).app.get(context.work.tenantId,context.work.principalId!,reference)
    return { fields: { artifactId: current.id, artifactKind: 'lecture_deck_html', title: current.title },
      sources: [{ ref: `presentation:${current.id}`, version: current.latestVersion?.id ?? String(current.outlineRevision), observedAt: current.updatedAt }] }
  },
}

export const presentationTools: ToolDefinition[] = [
  nativeTool('presentations.create', schemas.create, { description: 'Start the native presentation workflow from authorized knowledge sources. Read its progress and approve the outline before generation.', effect: 'transaction', approval: false, verify,
    async authorize(context, input) {
      await authorize(context, undefined, true)
      const scope = await resolvePresentationCreationScope(context.database as Queryable, { companyId: context.work.tenantId,
        conversationId: productConversationId(context.work), authorizationUserId: context.work.principalId!, ...(input.sourceIds ? { sourceIds: input.sourceIds } : {}) })
      for (const source of scope.sources) await authorizeAudienceRead(context,{ projectId: scope.projectId,action: 'knowledge:read',resource: { type: 'knowledge_source',id: source.sourceId } })
    },
    async execute(context, input) {
      const native = application(context)
      const value = await native.api.createPresentationForAgent(nativeContext(context), { ...input, idempotencyKey: context.action.idempotencyKey })
      await queueNativeEvents(context, native.events)
      return { ok: true, value }
    } }),
  nativeTool('presentations.get', schemas.get, { description: 'Read presentation progress, approved outline and the verified downloadable artifact when ready.', effect: 'read', approval: false,
    authorize: async (context, input) => authorize(context, input.presentationId),
    async execute(context, input) {
      const { app, api } = application(context), value = await api.getPresentationForAgent(nativeContext(context), input.presentationId)
      if (value.visibilityScope === 'PRIVATE' || value.status !== 'ready' || !value.latestVersion) return { ok: true, value }
      const file = await app.readVersion(context.work.tenantId, context.work.principalId!, input.presentationId, value.latestVersion.id)
      context.signal.throwIfAborted()
      const artifact = await context.createArtifact({ path: `presentations/${input.presentationId}.html`, mime: 'text/html', bytes: file.bytes,
        source: { ref: `presentation:${input.presentationId}`, version: value.latestVersion.id } })
      return { ok: true, value, artifacts: [artifact] }
    } }),
  nativeTool('presentations.approve_outline', schemas.approve_outline, { description: 'Request human approval of this exact presentation outline revision.', effect: 'transaction', approval: true, verify,
    authorize: async (context, input) => authorize(context, input.presentationId, true),
    async preview(context, input) {
      const current = await application(context).app.get(context.work.tenantId, context.work.principalId!, input.presentationId)
      if (current.outlineRevision !== input.expectedRevision || current.status !== 'awaitingOutlineApproval' || !current.outline) {
        throw new NoEffectError('presentation outline changed or is not awaiting approval', 'resource_conflict')
      }
      return { presentationId: current.id, title: current.title, expectedRevision: current.outlineRevision, outline: current.outline }
    },
    async execute(context, { presentationId, ...input }) {
      return { ok: true, value: await application(context).api.approvePresentationOutlineForAgent(nativeContext(context), presentationId,
        { ...input, idempotencyKey: context.action.idempotencyKey }) }
    } }),
  nativeTool('presentations.revise_outline', schemas.revise_outline, { description: 'Revise the unchanged outline before human approval.', effect: 'transaction', approval: false, verify,
    authorize: async (context, input) => authorize(context, input.presentationId, true),
    async execute(context, { presentationId, ...input }) { return { ok: true,
      value: await application(context).api.revisePresentationOutlineForAgent(nativeContext(context), presentationId, { ...input, idempotencyKey: context.action.idempotencyKey }) } } }),
  nativeTool('presentations.revise', schemas.revise, { description: 'Revise selected pages, sections or a ready presentation.', effect: 'transaction', approval: false, verify,
    authorize: async (context, input) => authorize(context, input.presentationId, true),
    async execute(context, { presentationId, ...input }) { return { ok: true,
      value: await application(context).api.revisePresentationForAgent(nativeContext(context), presentationId, { ...input, idempotencyKey: context.action.idempotencyKey }) } } }),
  nativeTool('presentations.cancel', schemas.get, { description: 'Cancel outstanding native presentation generation.', effect: 'transaction', approval: false, verify,
    authorize: async (context, input) => authorize(context, input.presentationId, true),
    async execute(context, input) { return { ok: true,
      value: await application(context).api.cancelPresentationForAgent(nativeContext(context), input.presentationId, { idempotencyKey: context.action.idempotencyKey }) } } }),
  nativeTool('presentations.retry', schemas.get, { description: 'Retry a failed native presentation job from its stored checkpoint.', effect: 'transaction', approval: false, verify,
    authorize: async (context, input) => authorize(context, input.presentationId, true),
    async execute(context, input) { return { ok: true,
      value: await application(context).api.retryPresentationForAgent(nativeContext(context), input.presentationId, { idempotencyKey: context.action.idempotencyKey }) } } }),
]
