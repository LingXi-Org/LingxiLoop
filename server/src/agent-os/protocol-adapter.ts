import type { WorkItem, WorkLane as LingxiOSWorkLane } from '../../../third_party/lingxios/src/protocol/types.js'
import type { AgentWorkItem, WorkLane } from './types.js'

export type LingxiLoopWorkMeta = {
  reason: AgentWorkItem['reason']
  executionRole: AgentWorkItem['executionRole']
  canvasId?: string
  canvasAssignmentId?: string
  progressFingerprint?: string
  noProgressCount?: number
}

export function toLingxiOSLane(lane: WorkLane): LingxiOSWorkLane {
  return lane === 'learner' ? 'interactive' : lane
}

export function toProductLane(lane: LingxiOSWorkLane): WorkLane {
  return lane === 'interactive' ? 'learner' : lane
}

export function toLingxiOSWork(work: AgentWorkItem): WorkItem {
  return {
    id: work.id,
    fence: work.fence,
    homeEpoch: work.homeEpoch ?? 1,
    tenantId: work.companyId,
    agentId: work.agentId,
    sessionId: work.channelId,
    ...(work.threadRootClientMsgNo ? { threadId: work.threadRootClientMsgNo } : {}),
    kind: work.reason === 'resume' ? 'resume' : work.reason === 'memory_synthesis' ? 'memory_synthesis' : 'turn',
    lane: toLingxiOSLane(work.lane),
    triggerRef: work.triggerClientMsgNo,
    ...(work.authorizationUserId ? { principalId: work.authorizationUserId } : {}),
    ...(work.createdAt ? { createdAt: work.createdAt } : {}),
    ...(work.availableAt ? { availableAt: work.availableAt } : {}),
    ...(work.attempts === undefined ? {} : { attempts: work.attempts }),
    ...(work.preemptions === undefined ? {} : { preemptions: work.preemptions }),
    leaseToken: work.leaseToken,
    meta: {
      reason: work.reason,
      executionRole: work.executionRole,
      ...(work.canvasId ? { canvasId: work.canvasId } : {}),
      ...(work.canvasAssignmentId ? { canvasAssignmentId: work.canvasAssignmentId } : {}),
      ...(work.progressFingerprint ? { progressFingerprint: work.progressFingerprint } : {}),
      ...(work.noProgressCount === undefined ? {} : { noProgressCount: work.noProgressCount }),
    } satisfies LingxiLoopWorkMeta,
  }
}

export function toProductWork(work: Omit<WorkItem, 'leaseToken'> & { leaseToken?: string }): AgentWorkItem {
  const meta = (work.meta ?? {}) as Partial<LingxiLoopWorkMeta>
  const reason = meta.reason ?? (work.kind === 'memory_synthesis' ? 'memory_synthesis' : work.kind === 'resume' ? 'resume' : 'message')
  return {
    id: work.id,
    fence: work.fence,
    homeEpoch: work.homeEpoch,
    companyId: work.tenantId,
    ...(work.principalId ? { authorizationUserId: work.principalId } : {}),
    agentId: work.agentId,
    channelId: work.sessionId,
    ...(work.threadId ? { threadRootClientMsgNo: work.threadId } : {}),
    triggerClientMsgNo: work.triggerRef,
    reason,
    executionRole: meta.executionRole ?? 'coordinator',
    lane: toProductLane(work.lane),
    ...(work.createdAt ? { createdAt: work.createdAt } : {}),
    ...(work.availableAt ? { availableAt: work.availableAt } : {}),
    ...(work.attempts === undefined ? {} : { attempts: work.attempts }),
    ...(work.preemptions === undefined ? {} : { preemptions: work.preemptions }),
    leaseToken: work.leaseToken ?? '',
    ...(meta.canvasId ? { canvasId: meta.canvasId } : {}),
    ...(meta.canvasAssignmentId ? { canvasAssignmentId: meta.canvasAssignmentId } : {}),
    ...(meta.progressFingerprint ? { progressFingerprint: meta.progressFingerprint } : {}),
    ...(meta.noProgressCount === undefined ? {} : { noProgressCount: meta.noProgressCount }),
  }
}
