import type { Queryable } from '../../db/queryable.js'
import { persistNativeEvents } from '../../agents/native-events.js'
import { findLearningMission } from './missions-repository.js'

/** Called in the owning mutation transaction, including delegated coordinator turns. */
export async function publishMissionProgress(db: Queryable, input: { companyId: string; projectId: string; missionId: string; workId?: string }) {
  const changed = await db.query<{ progress_version: number }>(`UPDATE learning_missions SET progress_version=progress_version+1,updated_at=NOW()
    WHERE company_id=$1 AND project_id=$2 AND id=$3 RETURNING progress_version`, [input.companyId,input.projectId,input.missionId])
  if (!changed.rows.length) throw new Error('Mission progress is unavailable')
  const mission = await findLearningMission(db,input.companyId,input.projectId,input.missionId)
  if (!mission) throw new Error('Mission disappeared during its mutation')
  const progressVersion = changed.rows[0].progress_version, clientNonce = `mission:${mission.id}:${progressVersion}`
  await persistNativeEvents(db, { companyId: input.companyId, workId: input.workId ?? `mission:${mission.id}`, key: clientNonce }, [{
    type: 'im.system', companyId: input.companyId, actorId: mission.coordinatorAgentId, channelId: mission.conversationId, clientNonce,
    payload: { version: 1, kind: 'learning_mission', clientMsgNo: clientNonce, body: mission.goal,
      replyToClientMsgNo: mission.triggerClientMsgNo, refs: { agentId: mission.coordinatorAgentId },
      data: { missionId: mission.id, projectId: mission.projectId, goal: mission.goal, successCriteria: mission.successCriteria,
        kind: mission.kind, status: mission.status, coordinatorAgentId: mission.coordinatorAgentId, steps: mission.steps,
        progressVersion, updatedAt: new Date(mission.updatedAt).toISOString(), suppressAgentWake: true } },
  }])
}
