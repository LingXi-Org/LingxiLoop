import { productConversationId } from '../../agent-runtime/identity.js'
import { NoEffectError, type ActionContext, type ToolDefinition } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { nativeTool, compareResource } from '../../agents/tools.js'
import { queueNativeEvents, type NativeEvent } from '../../agents/native-events.js'
import { missingAgentChannelMessageIds } from '../../im/public.js'
import { createPermissionService } from '../access/public.js'
import { createCanvasApplication } from './application.js'
import { agentCanvasSchemas } from './contracts.js'
import { createCanvasExecution, type CanvasRunRow } from './execution.js'
import { publishCanvasProgress } from './progress.js'
import { canvasById, conversationCanvasId, findFrame, lockReportWork, type CanvasRow } from './repository.js'

const reportRoles = { 'canvas.submit_report': 'specialist', 'canvas.submit_verification': 'verifier' } as const

export function createCanvasTools(control: Parameters<typeof createCanvasExecution>[0]): ToolDefinition[] {
  async function scope(context: ActionContext, write = false) {
    const { work } = context, db = context.database as Queryable
    await createPermissionService(db, { lockDependencies: true }).assertCan({ actorUserId: work.principalId!, companyId: work.tenantId,
      action: write ? 'canvas:write' : 'conversation:read', resource: { type: 'conversation', id: productConversationId(work) } })
    const id = await conversationCanvasId(db, work.tenantId, productConversationId(work))
    const canvas = id ? await canvasById(db, work.tenantId, id) : null
    if (write && canvas && !['active','summarizing'].includes(canvas.status)) throw new NoEffectError('Canvas workspace is no longer active', 'canvas_stopped')
    const assigned = await db.query('SELECT 1 FROM canvas_agent_runs WHERE work_id=$1 AND company_id=$2 AND assignment_id IS NOT NULL', [work.id,work.tenantId])
    if (assigned.rows.length) {
      const binding = canvas && await lockReportWork(db, { workId: work.id, companyId: work.tenantId, agentId: work.agentId, canvasId: canvas.id })
      if (!binding || binding.principal_id !== work.principalId) throw new NoEffectError('Canvas assignment was replaced or revoked', 'forbidden')
    }
    const reportRole = reportRoles[context.action.action as keyof typeof reportRoles]
    if (reportRole) {
      const binding = canvas && await lockReportWork(db, { workId: work.id, companyId: work.tenantId, agentId: work.agentId, canvasId: canvas.id })
      if (!binding || binding.principal_id !== work.principalId || binding.execution_role !== reportRole) {
        throw new NoEffectError('report tool requires the current assigned role', 'forbidden')
      }
    }
    return canvas
  }
  function application(context: ActionContext) {
    const db = context.database as Queryable, events: NativeEvent[] = []
    const execution = createCanvasExecution(control)
    const api = createCanvasApplication({ db, transaction: run => run(db), withCanvasFence: (_id, run) => run(db),
      execution,
      missingChannelMessageIds: input => missingAgentChannelMessageIds({ ...input, agentId: input.actorId, signal: context.signal }),
      publishEvent: async event => { events.push(event) },
    })
    return { api, events, execution }
  }
  async function requiredCanvas(context: ActionContext) {
    const canvas = await scope(context)
    if (!canvas) throw new NoEffectError('conversation Canvas not found', 'not_found')
    return canvas
  }
  const actor = (context: ActionContext) => ({ companyId: context.work.tenantId, actorId: context.work.agentId, actorKind: 'agent' as const })
  async function result(context: ActionContext, native: ReturnType<typeof application>, value: object, canvas: CanvasRow) {
    await queueNativeEvents(context, native.events)
    await publishCanvasProgress(context.database as Queryable,context.work.tenantId,canvas.id)
    return { ok: true as const, value: { result: value, canvasId: canvas.id } }
  }
  const authorize = async (context: ActionContext) => { await scope(context, !['canvas.current','canvas.available_agents'].includes(context.action.action)) }
  const verify: ToolDefinition['verify'] = async (context, _input, value) => {
    const receipt = value as { canvasId: string; result: { id?: string; frameId?: string; revision?: number; content?: string; body?: string; finding?: string; status?: string } }
    const canvas = await requiredCanvas(context)
    if (canvas.id !== receipt.canvasId) throw new Error('Canvas scope changed')
    const method = context.action.action.split('.')[1], db = context.database as Queryable
    if (['create_frame','update_frame','append_content','delete_frame'].includes(method)) {
      const id = receipt.result.id ?? receipt.result.frameId!
      const frame = await findFrame(db, context.work.tenantId, id)
      const expected = method === 'delete_frame' ? { exists: false } : { exists: true, revision: receipt.result.revision, content: receipt.result.content }
      return compareResource(`canvas_frame:${id}`, expected, { exists: Boolean(frame), revision: Number(frame?.revision), content: frame?.content })
    }
    if (method === 'submit_report' || method === 'submit_verification' || method === 'add_comment') {
      const table = method === 'add_comment' ? 'canvas_comments' : 'canvas_assignment_reports'
      const field = method === 'add_comment' ? 'body' : 'finding'
      const row = (await db.query(`SELECT ${field} FROM ${table} WHERE id=$1 AND canvas_id=$2`, [receipt.result.id,canvas.id])).rows[0]
      return compareResource(`canvas:${receipt.result.id}`, { [field]: receipt.result[field] }, row ?? {})
    }
    const snapshot = await application(context).api.getCanvasSnapshot(context.work.tenantId, context.work.agentId, canvas.id)
    const expected = method === 'stop_workspace' ? { status: 'stopped' } : { id: canvas.id }
    return compareResource(`canvas:${canvas.id}`, expected, snapshot)
  }
  async function submitReport(context: ActionContext, input: Omit<Parameters<ReturnType<typeof application>['api']['submitCanvasReport']>[0],
    'companyId' | 'canvasId' | 'workId' | 'agentId' | 'principalId' | 'requestVersion' | 'actionId' | 'executionRole' | 'signal'>) {
    const canvas = await requiredCanvas(context), native = application(context), db = context.database as Queryable
    const role = reportRoles[context.action.action as keyof typeof reportRoles]
    const { rows } = await db.query<CanvasRunRow>(`UPDATE canvas_agent_runs SET request_version=$3
      WHERE work_id=$1 AND canvas_id=$2 AND principal_id=$4 AND execution_role=$5 RETURNING *`,
      [context.work.id,canvas.id,context.requestVersion,context.work.principalId,role])
    if (!rows[0]) throw new NoEffectError('report tool requires the current assigned role', 'forbidden')
    return result(context, native, await native.api.submitCanvasReport({ ...input, companyId: context.work.tenantId,
      canvasId: canvas.id, workId: context.work.id, agentId: context.work.agentId, principalId: context.work.principalId!,
      requestVersion: context.requestVersion!, actionId: context.action.idempotencyKey, executionRole: rows[0].execution_role, signal: context.signal }), canvas)
  }
  return [
    nativeTool('canvas.current', agentCanvasSchemas.current, { description: 'Read the current Canvas, assignments and reports.', effect: 'read', approval: false, authorize,
      async execute(context) { return { ok: true, value: await application(context).api.getConversationCanvas(context.work.tenantId, productConversationId(context.work), context.work.principalId!) } } }),
    nativeTool('canvas.available_agents', agentCanvasSchemas.available_agents, { description: 'List Canvas agents.', effect: 'read', approval: false, authorize,
      async execute(context) { return { ok: true, value: await application(context).api.listCanvasAvailableAgents(context.work.tenantId, productConversationId(context.work)) } } }),
    nativeTool('canvas.create_frame', agentCanvasSchemas.create_frame, { description: 'Create a Canvas frame.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const canvas = await requiredCanvas(context), native = application(context); return result(context, native,
        await native.api.createCanvasFrame({ ...actor(context), canvasId: canvas.id, frame: input.frame, idempotencyKey: context.action.idempotencyKey }), canvas) } }),
    nativeTool('canvas.update_frame', agentCanvasSchemas.update_frame, { description: 'Update a frame at its observed revision.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const canvas = await requiredCanvas(context), native = application(context); await requireFrameScope(context, canvas, input.frameId); return result(context, native,
        await native.api.updateCanvasFrame({ ...actor(context), ...input }), canvas) } }),
    nativeTool('canvas.append_content', agentCanvasSchemas.append_content, { description: 'Append content to a Canvas frame.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const canvas = await requiredCanvas(context), native = application(context); await requireFrameScope(context, canvas, input.frameId); return result(context, native,
        await native.api.appendCanvasFrameContent({ ...actor(context), ...input }), canvas) } }),
    nativeTool('canvas.delete_frame', agentCanvasSchemas.delete_frame, { description: 'Delete a Canvas frame.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const canvas = await requiredCanvas(context), native = application(context); await requireFrameScope(context, canvas, input.frameId); return result(context, native,
        await native.api.deleteCanvasFrame({ ...actor(context), ...input }), canvas) } }),
    nativeTool('canvas.add_comment', agentCanvasSchemas.add_comment, { description: 'Add a Canvas comment.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const canvas = await requiredCanvas(context), native = application(context); if (input.frameId) await requireFrameScope(context, canvas, input.frameId); return result(context, native,
        await native.api.addCanvasComment({ ...actor(context), canvasId: canvas.id, ...input }), canvas) } }),
    nativeTool('canvas.start_workspace', agentCanvasSchemas.start_workspace, { description: 'Create shared Canvas assignments. Start each contribution with an explicit @id in your final group reply.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const native = application(context), work = context.work
        const snapshot = await native.api.startCanvasWorkspace({ ...input, companyId: work.tenantId, initiatorAgentId: work.agentId,
          conversationId: productConversationId(work), triggerClientMsgNo: work.threadId ?? work.triggerRef, idempotencyKey: context.action.idempotencyKey, authorizationUserId: work.principalId! })
        return result(context, native, snapshot, (await canvasById(context.database as Queryable, work.tenantId, snapshot.id))!) } }),
    nativeTool('canvas.stop_assignment', agentCanvasSchemas.stop_assignment, { description: 'Stop a Canvas assignment and its descendants.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context, input) { const canvas = await requiredCanvas(context), native = application(context); await native.api.stopCanvasAssignment({ ...input, companyId: context.work.tenantId, canvasId: canvas.id }); return result(context, native, { agentId: input.agentId, status: 'cancelled' }, canvas) } }),
    nativeTool('canvas.stop_workspace', agentCanvasSchemas.stop_workspace, { description: 'Stop the current Canvas and its execution.', effect: 'transaction', approval: false, authorize, verify,
      async execute(context) { const canvas = await requiredCanvas(context), native = application(context); await native.api.stopCanvasWorkspace({ companyId: context.work.tenantId, canvasId: canvas.id }); return result(context, native, { status: 'stopped' }, canvas) } }),
    nativeTool('canvas.submit_report', agentCanvasSchemas.submit_report, { description: 'Persist your assigned specialist finding backed by observed evidence versions.', effect: 'transaction', approval: false, authorize, verify, execute: submitReport }),
    nativeTool('canvas.submit_verification', agentCanvasSchemas.submit_verification, { description: 'Persist an independent verification of the assigned specialist report, including disconfirming checks and a verdict.', effect: 'transaction', approval: false, authorize, verify, execute: submitReport }),
  ]
}
async function requireFrameScope(context: ActionContext, canvas: CanvasRow, frameId: string) {
  const frame = await findFrame(context.database as Queryable, context.work.tenantId, frameId)
  if (!frame || frame.canvas_id !== canvas.id) throw new NoEffectError('frame is outside this conversation Canvas', 'forbidden')
}
