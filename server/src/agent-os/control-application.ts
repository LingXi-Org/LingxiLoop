import type { Queryable } from '../db/queryable.js'
import type { LingxiMessageV1 } from './types.js'
import {
  activeWorkId,
  appendWorkSteer,
  channelType,
  listVisibleRoutines,
  pauseRoutine,
  requestWorkCancellation,
  visibleRoutineChannel,
} from './control-repository.js'

export interface AgentControlInfrastructure {
  db: Queryable
  assertChannelAccessible(channelId: string, companyId: string, userId: string): Promise<void>
  sendMessage(
    channelId: string,
    channelType: number,
    fromUid: string,
    payload: LingxiMessageV1,
  ): Promise<unknown>
}

export class AgentControlApplication {
  constructor(private readonly infrastructure: AgentControlInfrastructure) {}

  listRoutines(input: { companyId: string; userId: string }) {
    return listVisibleRoutines(this.infrastructure.db, input)
  }

  async pauseRoutine(input: { routineId: string; companyId: string; userId: string }) {
    const channelId = await visibleRoutineChannel(this.infrastructure.db, input)
    if (!channelId) return null
    await this.infrastructure.assertChannelAccessible(channelId, input.companyId, input.userId)
    return pauseRoutine(this.infrastructure.db, input)
  }

  async stop(input: { companyId: string; userId: string; agentId: string; channelId: string }) {
    await this.infrastructure.assertChannelAccessible(input.channelId, input.companyId, input.userId)
    const workId = await activeWorkId(this.infrastructure.db, input)
    if (!workId) return null
    await requestWorkCancellation(this.infrastructure.db, workId)
    const type = await channelType(this.infrastructure.db, input)
    await this.infrastructure.sendMessage(input.channelId, type, input.userId, {
      version: 1,
      kind: 'tool_activity',
      clientMsgNo: `stop-${workId}:requested`,
      body: 'Learner requested Stop',
      refs: { workId, agentId: input.agentId },
      data: { stage: 'cancel_requested', suppressAgentWake: true },
    }).catch((error) => console.warn('[agent-control] stop projection failed', {
      workId,
      error: error instanceof Error ? error.message : String(error),
    }))
    return { workId }
  }

  async steer(input: {
    companyId: string
    userId: string
    agentId: string
    channelId: string
    text: string
    clientRequestId: string
  }): Promise<null | { kind: 'conflict' } | { kind: 'steered'; workId: string; steerId: string }> {
    await this.infrastructure.assertChannelAccessible(input.channelId, input.companyId, input.userId)
    const workId = await activeWorkId(this.infrastructure.db, input)
    if (!workId) return null
    const steer = { id: input.clientRequestId, text: input.text, createdAt: new Date().toISOString() }
    if (!await appendWorkSteer(this.infrastructure.db, { workId, steer })) return { kind: 'conflict' }
    const type = await channelType(this.infrastructure.db, input)
    await this.infrastructure.sendMessage(input.channelId, type, input.userId, {
      version: 1,
      kind: 'tool_activity',
      clientMsgNo: `steer-${workId}-${steer.id}`,
      body: 'Learner steered the active run',
      refs: { workId, agentId: input.agentId },
      data: { stage: 'steered', steerId: steer.id, suppressAgentWake: true },
    }).catch((error) => console.warn('[agent-control] steer projection failed', {
      workId,
      steerId: steer.id,
      error: error instanceof Error ? error.message : String(error),
    }))
    return { kind: 'steered', workId, steerId: steer.id }
  }
}
