import type { Queryable } from '../db/queryable.js'
import { createPermissionService } from '../modules/access/public.js'
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
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  assertChannelAccessible(channelId: string, companyId: string, userId: string, db?: Queryable): Promise<void>
  sendMessage(
    channelId: string,
    channelType: number,
    fromUid: string,
    payload: LingxiMessageV1,
  ): Promise<unknown>
}

export class AgentControlApplication {
  constructor(private readonly infrastructure: AgentControlInfrastructure) {}

  async listRoutines(input: { companyId: string; userId: string }) {
    const permissions = createPermissionService(this.infrastructure.db)
    await permissions.assertCan({
      actorUserId: input.userId,
      action: 'agent_run:control',
      companyId: input.companyId,
    })
    const routines = await listVisibleRoutines(this.infrastructure.db, input)
    const visible: Record<string, unknown>[] = []
    for (const routine of routines) {
      const id = typeof routine.id === 'string' ? routine.id : ''
      if (id && (await permissions.can({
        actorUserId: input.userId,
        action: 'agent_run:control',
        companyId: input.companyId,
        resource: { type: 'routine', id },
      })).allowed) visible.push(routine)
    }
    return visible
  }

  async pauseRoutine(input: { routineId: string; companyId: string; userId: string }) {
    return this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: input.userId,
        action: 'agent_run:control',
        companyId: input.companyId,
        resource: { type: 'routine', id: input.routineId },
      })
      const channelId = await visibleRoutineChannel(db, input)
      if (!channelId) return null
      await this.infrastructure.assertChannelAccessible(channelId, input.companyId, input.userId, db)
      return pauseRoutine(db, input)
    })
  }

  async stop(input: { companyId: string; userId: string; agentId: string; channelId: string }) {
    const workId = await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: input.userId,
        action: 'agent_run:control',
        companyId: input.companyId,
        resource: { type: 'conversation', id: input.channelId },
      })
      await this.infrastructure.assertChannelAccessible(input.channelId, input.companyId, input.userId, db)
      const id = await activeWorkId(db, input)
      if (id) await requestWorkCancellation(db, id)
      return id
    })
    if (!workId) return null
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
    const steer = { id: input.clientRequestId, text: input.text, createdAt: new Date().toISOString() }
    const outcome = await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: input.userId,
        action: 'agent_run:control',
        companyId: input.companyId,
        resource: { type: 'conversation', id: input.channelId },
      })
      await this.infrastructure.assertChannelAccessible(input.channelId, input.companyId, input.userId, db)
      const workId = await activeWorkId(db, input)
      if (!workId) return null
      return await appendWorkSteer(db, { workId, steer }) ? { kind: 'steered' as const, workId } : { kind: 'conflict' as const }
    })
    if (!outcome || outcome.kind === 'conflict') return outcome
    const { workId } = outcome
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
