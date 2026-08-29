import type { Queryable } from '../db/queryable.js'
import type { HostAction, AgentWorkItem, LingxiMessageV1 } from './types.js'
import {
  approvalChannelType,
  approvalWorkSource,
  decideApproval,
  enqueueApprovalResume,
  expireApproval,
  listVisibleApprovals,
  lockVisibleApproval,
  recordApprovalResult,
  type ApprovalResolutionRow,
} from './approval-repository.js'

export interface AgentApprovalInfrastructure {
  db: Queryable
  approvalTtlMs: number
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  assertTeacherApprovalFresh(
    input: { channelId: string; companyId: string; action: string; preview: Record<string, unknown> },
    db: Queryable,
  ): Promise<void>
  executeAction(work: AgentWorkItem, action: HostAction, approved: boolean): Promise<{ value?: unknown; error?: string }>
  sendMessage(channelId: string, channelType: number, fromUid: string, payload: LingxiMessageV1): Promise<unknown>
}

type Decision =
  | { kind: 'not_found' }
  | { kind: 'conflict'; status: string }
  | { kind: 'expired'; error: string }
  | { kind: 'decided'; approval: ApprovalResolutionRow }

export class AgentApprovalApplication {
  constructor(private readonly infrastructure: AgentApprovalInfrastructure) {}

  list(input: { companyId: string; userId: string }) {
    return listVisibleApprovals(this.infrastructure.db, input)
  }

  private decide(input: {
    approvalId: string
    companyId: string
    userId: string
    approved: boolean
  }): Promise<Decision> {
    return this.infrastructure.transaction(async (db) => {
      const approval = await lockVisibleApproval(db, input)
      if (!approval) return { kind: 'not_found' }
      const requestedStatus = input.approved ? 'approved' : 'rejected'
      if (approval.status !== 'pending' && approval.status !== requestedStatus) {
        return { kind: 'conflict', status: approval.status }
      }
      if (approval.status === 'pending' && input.approved
        && Date.now() - new Date(approval.requested_at).getTime() > this.infrastructure.approvalTtlMs) {
        const error = 'approval expired; request a fresh operation preview'
        await expireApproval(db, { approvalId: approval.id, userId: input.userId, error })
        return { kind: 'expired', error }
      }
      if (approval.status === 'pending' && input.approved && approval.action.startsWith('teacher.')) {
        try {
          await this.infrastructure.assertTeacherApprovalFresh({
            channelId: approval.channel_id,
            companyId: input.companyId,
            action: approval.action,
            preview: approval.preview ?? {},
          }, db)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await expireApproval(db, { approvalId: approval.id, userId: input.userId, error: message })
          return { kind: 'expired', error: message }
        }
      }
      if (approval.status === 'pending') {
        await decideApproval(db, {
          approvalId: approval.id,
          status: requestedStatus,
          userId: input.userId,
        })
      }
      return { kind: 'decided', approval }
    })
  }

  async resolve(input: {
    approvalId: string
    companyId: string
    userId: string
    approved: boolean
  }): Promise<
    | { kind: 'not_found' }
    | { kind: 'conflict'; status: string }
    | { kind: 'expired'; error: string }
    | { kind: 'resolved'; ok: boolean; approved: boolean; result: unknown; error: string | null }
  > {
    const decision = await this.decide(input)
    if (decision.kind !== 'decided') return decision
    const approval = decision.approval
    const source = await approvalWorkSource(this.infrastructure.db, approval.work_id)
    if (!source) throw new Error('approval source work missing')
    let result: unknown = { approved: false }
    let actionError: string | null = null
    if (input.approved) {
      const work: AgentWorkItem = {
        id: approval.work_id,
        companyId: source.company_id,
        agentId: source.agent_id,
        channelId: source.channel_id,
        triggerClientMsgNo: `approval:${approval.id}`,
        reason: 'resume',
        lane: 'approval',
        fence: Number(source.fence),
        leaseToken: 'approval-resolution',
        executionRole: source.execution_role,
        ...(source.thread_root_client_msg_no
          ? { threadRootClientMsgNo: source.thread_root_client_msg_no }
          : {}),
      }
      const action: HostAction = {
        runId: approval.run_id,
        cellId: approval.cell_id,
        callIndex: approval.call_index,
        action: approval.action,
        args: approval.args,
        idempotencyKey: approval.idempotency_key,
      }
      const executed = await this.infrastructure.executeAction(work, action, true)
      result = executed.value
      actionError = executed.error ?? null
      await recordApprovalResult(this.infrastructure.db, {
        approvalId: approval.id,
        result,
        error: actionError,
      })
    }
    const channelType = await approvalChannelType(this.infrastructure.db, {
      channelId: approval.channel_id,
      companyId: input.companyId,
    })
    await this.infrastructure.sendMessage(approval.channel_id, channelType, approval.agent_id, {
      version: 1,
      kind: 'approval',
      clientMsgNo: `approval-${approval.id}:resolved`,
      body: input.approved ? 'Approval granted' : 'Approval denied',
      refs: { approvalId: approval.id, agentId: approval.agent_id },
      data: {
        id: approval.id,
        agentId: approval.agent_id,
        kind: approval.action.startsWith('email.')
          ? 'external_communication'
          : String(approval.scope?.risk ?? 'sensitive_or_destructive_action'),
        summary: approval.summary,
        status: input.approved ? 'approved' : 'rejected',
        payload: { action: approval.action, args: approval.args },
        requestedAt: approval.requested_at,
        resolvedAt: new Date().toISOString(),
        resolvedBy: input.userId,
        requestedBy: approval.requested_by,
        scope: approval.scope,
        preview: approval.preview,
        error: actionError,
        suppressAgentWake: true,
      },
    }).catch((error) => console.warn('[agent-approval] resolution projection failed', {
      approvalId: approval.id,
      error: error instanceof Error ? error.message : String(error),
    }))
    await enqueueApprovalResume(this.infrastructure.db, {
      approvalId: approval.id,
      companyId: input.companyId,
      agentId: approval.agent_id,
      channelId: approval.channel_id,
      executionRole: source.execution_role,
    })
    return {
      kind: 'resolved',
      ok: actionError === null,
      approved: input.approved,
      result,
      error: actionError,
    }
  }
}
